// Tauri commands — Rust implementations of the control-panel API for desktop-native mode.
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tauri::State;

// --- Types matching the frontend TypeScript interfaces ---

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TargetProfile {
  pub id: String,
  pub label: String,
  pub skill_dirs: Vec<String>,
  pub link_mode: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AgentState {
  pub profile_id: String,
  pub profile_label: String,
  pub state: String,
  pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MappingSummary {
  pub total: u32,
  pub linked: u32,
  pub missing: u32,
  pub conflict: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
  pub name: String,
  pub path: String,
  pub source: String,
  #[serde(rename = "sourceLabel")]
  pub source_label: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub validation_status: Option<String>,
  #[serde(default)]
  pub agent_states: Vec<AgentState>,
  pub mapping_summary: MappingSummary,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StatusResponse {
  pub app: String,
  pub api_version: String,
  pub project_root: String,
  pub skills: Vec<Skill>,
  pub installs: Vec<JsonValue>,
  pub non_skill_directories: Vec<String>,
  pub target_profiles: Vec<TargetProfile>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverResponse {
  pub skills: Vec<Skill>,
  pub non_skill_directories: Vec<String>,
  pub target_profiles: Vec<TargetProfile>,
}

// --- Config reading ---

fn load_config(workspace_root: &Path) -> (String, Vec<TargetEntry>) {
  let config_path = workspace_root.join("skillgov.config.json");
  let project_root = workspace_root.to_string_lossy().replace('\\', "/");

  if config_path.exists() {
    if let Ok(raw) = fs::read_to_string(&config_path) {
      if let Ok(json) = serde_json::from_str::<JsonValue>(&raw) {
        let pr = json
          .get("projectRoot")
          .and_then(JsonValue::as_str)
          .unwrap_or(&project_root)
          .to_string();

        let targets = parse_targets(json.get("targets"));
        return (pr, targets);
      }
    }
  }

  (project_root, vec![])
}

#[derive(Clone, Debug)]
enum TargetEntry {
  Id(String),
  Custom {
    id: String,
    label: String,
    skill_dirs: Vec<String>,
    link_mode: String,
  },
}

fn parse_targets(value: Option<&JsonValue>) -> Vec<TargetEntry> {
  let arr = match value.and_then(JsonValue::as_array) {
    Some(a) => a,
    None => return vec![],
  };

  arr
    .iter()
    .map(|v| {
      if let Some(s) = v.as_str() {
        TargetEntry::Id(s.to_string())
      } else if let Some(obj) = v.as_object() {
        TargetEntry::Custom {
          id: obj
            .get("id")
            .and_then(JsonValue::as_str)
            .unwrap_or("")
            .to_string(),
          label: obj
            .get("label")
            .and_then(JsonValue::as_str)
            .unwrap_or("")
            .to_string(),
          skill_dirs: obj
            .get("skillDirs")
            .and_then(JsonValue::as_array)
            .map(|a| {
              a.iter()
                .filter_map(JsonValue::as_str)
                .map(String::from)
                .collect()
            })
            .unwrap_or_default(),
          link_mode: obj
            .get("linkMode")
            .and_then(JsonValue::as_str)
            .unwrap_or("junction")
            .to_string(),
        }
      } else {
        TargetEntry::Id(String::new())
      }
    })
    .collect()
}

fn resolve_target(entry: &TargetEntry) -> TargetProfile {
  match entry {
    TargetEntry::Id(id) => default_target(id),
    TargetEntry::Custom {
      id,
      label,
      skill_dirs,
      link_mode,
    } => TargetProfile {
      id: id.clone(),
      label: if label.is_empty() { id.clone() } else { label.clone() },
      skill_dirs: skill_dirs.clone(),
      link_mode: link_mode.clone(),
    },
  }
}

fn default_target(id: &str) -> TargetProfile {
  let home = home_dir();
  match id {
    "claude" => TargetProfile {
      id: "claude".into(),
      label: "Claude".into(),
      skill_dirs: vec![format!("{}/.claude/skills", home)],
      link_mode: "junction".into(),
    },
    "codex" => TargetProfile {
      id: "codex".into(),
      label: "Codex".into(),
      skill_dirs: vec![format!("{}/.codex/skills", home)],
      link_mode: "junction".into(),
    },
    other => TargetProfile {
      id: other.into(),
      label: other.into(),
      skill_dirs: vec![],
      link_mode: "junction".into(),
    },
  }
}

fn resolve_targets(entries: &[TargetEntry]) -> Vec<TargetProfile> {
  if entries.is_empty() {
    return vec![default_target("claude"), default_target("codex")];
  }
  entries.iter().map(resolve_target).collect()
}

fn home_dir() -> String {
  std::env::var("USERPROFILE")
    .or_else(|_| std::env::var("HOME"))
    .unwrap_or_else(|_| ".".into())
    .replace('\\', "/")
}

// --- Skill scanning ---

struct SkillCandidate {
  name: String,
  path: String,
  source: String,
}

fn scan_skill_dir(dir: &Path, source: &str) -> (Vec<SkillCandidate>, Vec<String>) {
  let mut skills = Vec::new();
  let mut non_skill_dirs = Vec::new();

  let entries = match fs::read_dir(dir) {
    Ok(e) => e,
    Err(_) => return (skills, non_skill_dirs),
  };

  for entry in entries.flatten() {
    let name = entry.file_name().to_string_lossy().to_string();
    if name == ".system" {
      continue;
    }
    let full_path = entry.path();
    if !full_path.is_dir() {
      continue;
    }
    if full_path.join("SKILL.md").exists() {
      skills.push(SkillCandidate {
        name,
        path: full_path.to_string_lossy().replace('\\', "/"),
        source: source.to_string(),
      });
    } else {
      non_skill_dirs.push(name);
    }
  }

  (skills, non_skill_dirs)
}

fn merge_candidates(candidates: Vec<SkillCandidate>) -> Vec<SkillCandidate> {
  let mut by_name: HashMap<String, SkillCandidate> = HashMap::new();
  for candidate in candidates {
    let existing = by_name.get(&candidate.name);
    if existing.is_none() || (candidate.source == "project" && existing.unwrap().source != "project")
    {
      by_name.insert(candidate.name.clone(), candidate);
    }
  }
  by_name.into_values().collect()
}

// --- Registry reading ---

struct ImportedSkill {
  origin: Option<String>,
}

fn read_skills_registry(path: &Path) -> HashMap<String, ImportedSkill> {
  let mut result = HashMap::new();
  let raw = match fs::read_to_string(path) {
    Ok(r) => r,
    Err(_) => return result,
  };
  let json: JsonValue = match serde_json::from_str(&raw) {
    Ok(j) => j,
    Err(_) => return result,
  };
  if let Some(skills) = json.get("skills").and_then(JsonValue::as_object) {
    for (name, entry) in skills {
      let origin = entry.get("origin").and_then(JsonValue::as_str).map(String::from);
      result.insert(name.clone(), ImportedSkill { origin });
    }
  }
  result
}

fn read_mappings_registry(path: &Path) -> HashMap<String, HashMap<String, String>> {
  let mut result = HashMap::new();
  let raw = match fs::read_to_string(path) {
    Ok(r) => r,
    Err(_) => return result,
  };
  let json: JsonValue = match serde_json::from_str(&raw) {
    Ok(j) => j,
    Err(_) => return result,
  };
  if let Some(mappings) = json.get("mappings").and_then(JsonValue::as_object) {
    for (skill_name, mapping) in mappings {
      let mut links = HashMap::new();
      if let Some(mapping_links) = mapping.get("links").and_then(JsonValue::as_object) {
        for (target, link) in mapping_links {
          if !link.is_null() {
            let link_type = link
              .get("type")
              .and_then(JsonValue::as_str)
              .unwrap_or("standard")
              .to_string();
            links.insert(target.clone(), link_type);
          }
        }
      }
      result.insert(skill_name.clone(), links);
    }
  }
  result
}

// --- Link detection (simplified) ---

fn is_junction_or_symlink(path: &Path) -> bool {
  #[cfg(windows)]
  {
    use std::os::windows::fs::MetadataExt;
    if let Ok(meta) = fs::metadata(path) {
      let attrs = meta.file_attributes();
      // FILE_ATTRIBUTE_REPARSE_POINT = 0x400
      return attrs & 0x400 != 0;
    }
  }
  #[cfg(not(windows))]
  {
    if let Ok(meta) = fs::symlink_metadata(path) {
      return meta.file_type().is_symlink();
    }
  }
  false
}

fn paths_resolve_same(a: &Path, b: &Path) -> bool {
  let ra = fs::canonicalize(a).unwrap_or_else(|_| a.to_path_buf());
  let rb = fs::canonicalize(b).unwrap_or_else(|_| b.to_path_buf());
  ra == rb
}

// --- Command implementations ---

#[tauri::command]
pub fn get_status(workspace_root: State<'_, PathBuf>) -> Result<StatusResponse, String> {
  let root = workspace_root.as_ref();
  let (project_root, target_entries) = load_config(root);
  let profiles = resolve_targets(&target_entries);

  let registry_path = root.join("registry").join("skills.json");
  let mappings_path = root.join("registry").join("mappings.json");
  let imported = read_skills_registry(&registry_path);
  let mappings = read_mappings_registry(&mappings_path);

  let mut candidates: Vec<SkillCandidate> = Vec::new();
  let mut non_skill_dirs: Vec<String> = Vec::new();

  // Scan project skills
  let (proj_skills, proj_non) = scan_skill_dir(&root.join("skills"), "project");
  candidates.extend(proj_skills);
  non_skill_dirs.extend(proj_non);

  // Scan target skill dirs
  for profile in &profiles {
    for skill_dir in &profile.skill_dirs {
      let dir = PathBuf::from(skill_dir);
      let (agent_skills, agent_non) = scan_skill_dir(&dir, "agent");
      candidates.extend(agent_skills);
      non_skill_dirs.extend(agent_non);
    }
  }

  let merged = merge_candidates(candidates);
  let skills: Vec<Skill> = merged
    .iter()
    .map(|c| build_skill(c, &profiles, &imported, &mappings, root))
    .collect();

  let installs = mappings
    .iter()
    .flat_map(|(skill_name, links)| {
      links.iter().map(move |(target, link_type)| {
        serde_json::json!({
          "skillName": skill_name,
          "target": target,
          "type": link_type,
        })
      })
    })
    .collect();

  Ok(StatusResponse {
    app: "SkillGov".into(),
    api_version: "0.1.0".into(),
    project_root,
    skills,
    installs,
    non_skill_directories: non_skill_dirs,
    target_profiles: profiles,
  })
}

#[tauri::command]
pub fn list_targets(workspace_root: State<'_, PathBuf>) -> Result<Vec<TargetProfile>, String> {
  let (_, target_entries) = load_config(workspace_root.as_ref());
  Ok(resolve_targets(&target_entries))
}

#[tauri::command]
pub fn discover_skills(workspace_root: State<'_, PathBuf>) -> Result<DiscoverResponse, String> {
  let root = workspace_root.as_ref();
  let (_, target_entries) = load_config(root);
  let profiles = resolve_targets(&target_entries);

  let registry_path = root.join("registry").join("skills.json");
  let mappings_path = root.join("registry").join("mappings.json");
  let imported = read_skills_registry(&registry_path);
  let mappings = read_mappings_registry(&mappings_path);

  let mut candidates: Vec<SkillCandidate> = Vec::new();
  let mut non_skill_dirs: Vec<String> = Vec::new();

  let (proj_skills, proj_non) = scan_skill_dir(&root.join("skills"), "project");
  candidates.extend(proj_skills);
  non_skill_dirs.extend(proj_non);

  for profile in &profiles {
    for skill_dir in &profile.skill_dirs {
      let dir = PathBuf::from(skill_dir);
      let (agent_skills, agent_non) = scan_skill_dir(&dir, "agent");
      candidates.extend(agent_skills);
      non_skill_dirs.extend(agent_non);
    }
  }

  let merged = merge_candidates(candidates);
  let skills: Vec<Skill> = merged
    .iter()
    .map(|c| build_skill(c, &profiles, &imported, &mappings, root))
    .collect();

  Ok(DiscoverResponse {
    skills,
    non_skill_directories: non_skill_dirs,
    target_profiles: profiles,
  })
}

fn build_skill(
  candidate: &SkillCandidate,
  profiles: &[TargetProfile],
  imported: &HashMap<String, ImportedSkill>,
  mappings: &HashMap<String, HashMap<String, String>>,
  project_root: &Path,
) -> Skill {
  let canonical_path = if candidate.source == "project" {
    candidate.path.clone()
  } else {
    project_root
      .join("skills")
      .join(&candidate.name)
      .to_string_lossy()
      .replace('\\', "/")
  };

  let mut agent_states = Vec::new();
  let mut mapping_summary = MappingSummary {
    total: 0,
    linked: 0,
    missing: 0,
    conflict: 0,
  };

  for profile in profiles {
    for skill_dir in &profile.skill_dirs {
      let link_path = PathBuf::from(skill_dir).join(&candidate.name);
      let link_path_str = link_path.to_string_lossy().replace('\\', "/");

      if !link_path.exists() {
        agent_states.push(AgentState {
          profile_id: profile.id.clone(),
          profile_label: profile.label.clone(),
          state: "unmapped".into(),
          path: link_path_str,
        });
        continue;
      }

      if is_junction_or_symlink(&link_path) {
        let linked = paths_resolve_same(&link_path, Path::new(&canonical_path));
        let state = if linked { "managed-linked" } else { "conflict" };
        agent_states.push(AgentState {
          profile_id: profile.id.clone(),
          profile_label: profile.label.clone(),
          state: state.into(),
          path: link_path_str,
        });
        mapping_summary.total += 1;
        if linked {
          mapping_summary.linked += 1;
        } else {
          mapping_summary.conflict += 1;
        }
      } else {
        agent_states.push(AgentState {
          profile_id: profile.id.clone(),
          profile_label: profile.label.clone(),
          state: "unmanaged-local".into(),
          path: link_path_str,
        });
      }
    }
  }

  // Check if there are mappings for targets not in profiles
  if let Some(skill_links) = mappings.get(&candidate.name) {
    let profile_ids: Vec<&str> = profiles.iter().map(|p| p.id.as_str()).collect();
    for target in skill_links.keys() {
      if !profile_ids.contains(&target.as_str()) {
        mapping_summary.total += 1;
        mapping_summary.linked += 1;
      }
    }
  }

  let source_label = if candidate.source == "project" {
    imported
      .get(&candidate.name)
      .and_then(|i| i.origin.as_deref())
      .map(label_for_origin)
      .unwrap_or_else(|| "SkillGov 技能库".into())
  } else {
    candidate.source.clone()
  };

  let validation_status = validate_skill_path(&candidate.path);

  Skill {
    name: candidate.name.clone(),
    path: candidate.path.clone(),
    source: candidate.source.clone(),
    source_label,
    validation_status: Some(validation_status),
    agent_states,
    mapping_summary,
  }
}

fn label_for_origin(origin: &str) -> String {
  match origin {
    "local" => "手动导入".into(),
    "codex-plugin-cache" => "Codex 插件缓存".into(),
    other => other.into(),
  }
}

fn validate_skill_path(skill_path: &str) -> String {
  let path = Path::new(skill_path);
  let skill_md = path.join("SKILL.md");
  if !skill_md.exists() {
    return "fail".into();
  }
  // Basic validation: SKILL.md exists
  "pass".into()
}

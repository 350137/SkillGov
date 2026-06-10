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

// --- Registry types ---

type MappingLinks = HashMap<String, HashMap<String, JsonValue>>;
const MAPPING_METADATA_KEYS: [&str; 4] = ["skillName", "canonicalPath", "links", "updatedAt"];

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
      for (target, link) in mapping_links_from_value(mapping) {
        let link_type = link
          .get("type")
          .and_then(JsonValue::as_str)
          .unwrap_or("standard")
          .to_string();
        links.insert(target, link_type);
      }
      result.insert(skill_name.clone(), links);
    }
  }
  result
}

fn mapping_links_from_value(mapping: &JsonValue) -> HashMap<String, JsonValue> {
  let mut links = HashMap::new();

  if let Some(mapping_links) = mapping.get("links").and_then(JsonValue::as_object) {
    for (target, link) in mapping_links {
      if !link.is_null() {
        links.insert(target.clone(), link.clone());
      }
    }
    return links;
  }

  if let Some(mapping_obj) = mapping.as_object() {
    for (target, link) in mapping_obj {
      if MAPPING_METADATA_KEYS.contains(&target.as_str()) || link.is_null() {
        continue;
      }
      if link.get("path").and_then(JsonValue::as_str).is_some() {
        links.insert(target.clone(), link.clone());
      }
    }
  }

  links
}

// --- Link detection (simplified) ---

fn is_junction_or_symlink(path: &Path) -> bool {
  #[cfg(windows)]
  {
    use std::os::windows::fs::MetadataExt;
    if let Ok(meta) = fs::symlink_metadata(path) {
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

  #[cfg(windows)]
  {
    return ra
      .to_string_lossy()
      .eq_ignore_ascii_case(&rb.to_string_lossy());
  }

  #[cfg(not(windows))]
  {
    ra == rb
  }
}

// --- Command implementations ---

#[tauri::command]
pub fn get_status(workspace_root: State<'_, PathBuf>) -> Result<StatusResponse, String> {
  let root: &Path = &workspace_root;
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
  let root: &Path = &workspace_root;
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
  "pass".into()
}

// --- Additional types for write operations ---

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SingleResult {
  pub status: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BatchResultItem {
  pub name: String,
  pub status: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BatchResult {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub summary: Option<HashMap<String, u32>>,
  pub results: Vec<BatchResultItem>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompatIssue {
  pub severity: String,
  pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompatResult {
  pub status: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reason: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub suggested_action: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub issues: Option<Vec<CompatIssue>>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DoctorIssue {
  pub severity: String,
  pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DoctorResult {
  pub issues: Vec<DoctorIssue>,
}

// --- Mapping helpers ---

fn create_junction_or_symlink(target: &Path, link: &Path, mode: &str) -> Result<(), String> {
  if link.exists() {
    return Err(format!("Link path already exists: {}", link.display()));
  }
  if let Some(parent) = link.parent() {
    fs::create_dir_all(parent)
      .map_err(|e| format!("Failed to create parent dir: {e}"))?;
  }

  #[cfg(windows)]
  {
    if mode == "junction" || mode == "symlink" {
      // Use mklink /J on Windows for junction creation
      let link_str = link.to_string_lossy().replace('/', "\\");
      let target_str = target.to_string_lossy().replace('/', "\\");
      let status = std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J", &link_str, &target_str])
        .output()
        .map_err(|e| format!("Failed to run mklink: {e}"))?;
      if !status.status.success() {
        let stderr = String::from_utf8_lossy(&status.stderr);
        return Err(format!("mklink failed: {stderr}"));
      }
    } else {
      copy_dir_recursive(target, link)?;
    }
  }
  #[cfg(not(windows))]
  {
    if mode == "symlink" {
      std::os::unix::fs::symlink(target, link)
        .map_err(|e| format!("Failed to create symlink: {e}"))?;
    } else {
      copy_dir_recursive(target, link)?;
    }
  }
  Ok(())
}

fn remove_link(link: &Path) -> Result<(), String> {
  if !link.exists() {
    return Err(format!("Link does not exist: {}", link.display()));
  }
  if is_junction_or_symlink(link) {
    #[cfg(windows)]
    {
      // On Windows, remove junction via fs::remove_dir (junctions are directory reparse points)
      fs::remove_dir(link)
        .map_err(|e| format!("Failed to remove junction: {e}"))?;
    }
    #[cfg(not(windows))]
    {
      fs::remove_file(link)
        .map_err(|e| format!("Failed to remove symlink: {e}"))?;
    }
  } else {
    return Err(format!(
      "Refusing to remove plain directory: {}",
      link.display()
    ));
  }
  Ok(())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
  fs::create_dir_all(dst)
    .map_err(|e| format!("Failed to create dir {}: {e}", dst.display()))?;
  let entries = fs::read_dir(src)
    .map_err(|e| format!("Failed to read dir {}: {e}", src.display()))?;
  for entry in entries.flatten() {
    let src_path = entry.path();
    let dst_path = dst.join(entry.file_name());
    if src_path.is_dir() {
      copy_dir_recursive(&src_path, &dst_path)?;
    } else {
      fs::copy(&src_path, &dst_path)
        .map_err(|e| format!("Failed to copy file: {e}"))?;
    }
  }
  Ok(())
}

fn write_mappings_registry(
  path: &Path,
  project_root: &Path,
  mappings: &MappingLinks,
) -> Result<(), String> {
  let updated_at = chrono_timestamp();
  let mut mappings_obj = serde_json::Map::new();

  for (skill_name, links) in mappings {
    if links.is_empty() {
      continue;
    }

    let canonical_path = project_root
      .join("skills")
      .join(skill_name)
      .to_string_lossy()
      .replace('\\', "/");
    let mut links_obj = serde_json::Map::new();
    for (target, link) in links {
      links_obj.insert(target.clone(), link.clone());
    }

    mappings_obj.insert(
      skill_name.clone(),
      serde_json::json!({
        "skillName": skill_name,
        "canonicalPath": canonical_path,
        "links": links_obj,
        "updatedAt": updated_at,
      }),
    );
  }

  let json = serde_json::json!({ "mappings": mappings_obj });
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)
      .map_err(|e| format!("Failed to create registry dir: {e}"))?;
  }
  let content = serde_json::to_string_pretty(&json)
    .map_err(|e| format!("Failed to serialize mappings: {e}"))?;
  fs::write(path, content)
    .map_err(|e| format!("Failed to write mappings: {e}"))?;
  Ok(())
}

fn read_mappings_raw(path: &Path) -> MappingLinks {
  let raw = match fs::read_to_string(path) {
    Ok(r) => r,
    Err(_) => return HashMap::new(),
  };
  let json: JsonValue = match serde_json::from_str(&raw) {
    Ok(j) => j,
    Err(_) => return HashMap::new(),
  };
  let mut result = HashMap::new();
  if let Some(mappings) = json.get("mappings").and_then(JsonValue::as_object) {
    for (skill_name, mapping) in mappings {
      let links = mapping_links_from_value(mapping);
      if !links.is_empty() {
        result.insert(skill_name.clone(), links);
      }
    }
  }
  result
}

fn find_profile<'a>(profiles: &'a [TargetProfile], target: &str) -> Option<&'a TargetProfile> {
  profiles.iter().find(|p| p.id == target)
}

// --- Command implementations: write operations ---

#[tauri::command]
pub fn map_skill(
  workspace_root: State<'_, PathBuf>,
  skill_name: String,
  target: String,
) -> Result<SingleResult, String> {
  map_skill_impl(workspace_root.as_ref(), skill_name, target)
}

#[tauri::command]
pub fn unmap_skill(
  workspace_root: State<'_, PathBuf>,
  skill_name: String,
  target: String,
) -> Result<SingleResult, String> {
  unmap_skill_impl(workspace_root.as_ref(), skill_name, target)
}

#[tauri::command]
pub fn adopt_skill(
  workspace_root: State<'_, PathBuf>,
  skill_name: String,
  target: String,
) -> Result<SingleResult, String> {
  adopt_skill_impl(workspace_root.as_ref(), skill_name, target)
}

fn check_compat_impl(root: &Path, skill_path: String, target: String) -> Result<CompatResult, String> {
  let (_, target_entries) = load_config(root);
  let profiles = resolve_targets(&target_entries);
  let _profile = find_profile(&profiles, &target)
    .ok_or_else(|| format!("Unknown target: {target}"))?;

  let path = Path::new(&skill_path);
  let mut issues = Vec::new();

  if !path.join("SKILL.md").exists() {
    issues.push(CompatIssue {
      severity: "error".into(),
      message: "Missing SKILL.md".into(),
    });
  }

  let status = if issues.iter().any(|i| i.severity == "error") {
    "unsupported"
  } else if issues.iter().any(|i| i.severity == "warning") {
    "needs-overlay"
  } else {
    "compatible"
  };

  Ok(CompatResult {
    status: status.into(),
    reason: if issues.is_empty() {
      None
    } else {
      Some(format!("{} issue(s) found", issues.len()))
    },
    suggested_action: None,
    issues: if issues.is_empty() { None } else { Some(issues) },
  })
}

#[tauri::command]
pub fn check_compat(
  workspace_root: State<'_, PathBuf>,
  skill_path: String,
  target: String,
) -> Result<CompatResult, String> {
  check_compat_impl(workspace_root.as_ref(), skill_path, target)
}

#[tauri::command]
pub fn compat_batch(
  workspace_root: State<'_, PathBuf>,
  skill_names: Vec<String>,
  target: String,
) -> Result<BatchResult, String> {
  let root: &Path = &workspace_root;
  let mut results = Vec::new();
  let mut summary: HashMap<String, u32> = HashMap::new();

  for name in &skill_names {
    let skill_path = root.join("skills").join(name).to_string_lossy().to_string();
    let result = check_compat_impl(root, skill_path, target.clone());
    match result {
      Ok(compat) => {
        *summary.entry(compat.status.clone()).or_insert(0) += 1;
        results.push(BatchResultItem {
          name: name.clone(),
          status: compat.status,
          message: compat.reason,
          error: None,
        });
      }
      Err(e) => {
        *summary.entry("error".into()).or_insert(0) += 1;
        results.push(BatchResultItem {
          name: name.clone(),
          status: "error".into(),
          message: None,
          error: Some(e),
        });
      }
    }
  }

  Ok(BatchResult {
    summary: Some(summary),
    results,
  })
}

fn batch_operation(
  workspace_root: &Path,
  skill_names: &[String],
  target: &str,
  op: fn(&Path, String, String) -> Result<SingleResult, String>,
) -> BatchResult {
  let mut results = Vec::new();
  let mut summary: HashMap<String, u32> = HashMap::new();

  for name in skill_names {
    let result = op(workspace_root, name.clone(), target.to_string());
    match result {
      Ok(single) => {
        *summary.entry(single.status.clone()).or_insert(0) += 1;
        results.push(BatchResultItem {
          name: name.clone(),
          status: single.status,
          message: single.message,
          error: None,
        });
      }
      Err(e) => {
        *summary.entry("error".into()).or_insert(0) += 1;
        results.push(BatchResultItem {
          name: name.clone(),
          status: "error".into(),
          message: None,
          error: Some(e),
        });
      }
    }
  }

  BatchResult {
    summary: Some(summary),
    results,
  }
}

fn map_skill_impl(root: &Path, skill_name: String, target: String) -> Result<SingleResult, String> {
  let (_, target_entries) = load_config(root);
  let profiles = resolve_targets(&target_entries);
  let profile = find_profile(&profiles, &target)
    .ok_or_else(|| format!("Unknown target: {target}"))?;
  let skill_path = root.join("skills").join(&skill_name);
  if !skill_path.exists() {
    return Ok(SingleResult {
      status: "not-found".into(),
      message: Some(format!("Skill '{}' not found", skill_name)),
    });
  }
  let mappings_path = root.join("registry").join("mappings.json");
  let mut mappings = read_mappings_raw(&mappings_path);
  let skill_links = mappings.entry(skill_name.clone()).or_default();
  let first_skill_dir = profile.skill_dirs.first()
    .ok_or_else(|| format!("No skill dirs for target: {target}"))?;
  let link_path = PathBuf::from(first_skill_dir).join(&skill_name);
  if let Some(existing) = skill_links.get(&target) {
    if !existing.is_null() {
      return Ok(SingleResult {
        status: "already-mapped".into(),
        message: Some(format!("'{}' is already mapped to {}", skill_name, target)),
      });
    }
  }
  create_junction_or_symlink(&skill_path, &link_path, &profile.link_mode)?;
  let now = chrono_timestamp();
  skill_links.insert(
    target.clone(),
    serde_json::json!({
      "path": link_path.to_string_lossy().replace('\\', "/"),
      "mode": profile.link_mode,
      "status": "linked",
      "type": "standard",
      "linkedAt": now,
      "updatedAt": now
    }),
  );
  write_mappings_registry(&mappings_path, root, &mappings)?;
  Ok(SingleResult { status: "mapped".into(), message: Some(format!("Mapped '{}' to {}", skill_name, target)) })
}

fn unmap_skill_impl(root: &Path, skill_name: String, target: String) -> Result<SingleResult, String> {
  let (_, target_entries) = load_config(root);
  let profiles = resolve_targets(&target_entries);
  let profile = find_profile(&profiles, &target)
    .ok_or_else(|| format!("Unknown target: {target}"))?;
  let first_skill_dir = profile.skill_dirs.first()
    .ok_or_else(|| format!("No skill dirs for target: {target}"))?;
  let link_path = PathBuf::from(first_skill_dir).join(&skill_name);

  let mappings_path = root.join("registry").join("mappings.json");
  let mut mappings = read_mappings_raw(&mappings_path);

  if !link_path.exists() {
    if let Some(skill_links) = mappings.get_mut(&skill_name) {
      skill_links.remove(&target);
    }
    mappings.retain(|_, links| !links.is_empty());
    write_mappings_registry(&mappings_path, root, &mappings)?;
    return Ok(SingleResult {
      status: "not-found".into(),
      message: Some(format!("No link found for '{}' on {}", skill_name, target)),
    });
  }

  if !is_junction_or_symlink(&link_path) {
    return Ok(SingleResult {
      status: "refused".into(),
      message: Some("Target is a plain directory, not a managed link.".into()),
    });
  }

  let canonical_path = root.join("skills").join(&skill_name);
  if !paths_resolve_same(&link_path, &canonical_path) {
    return Ok(SingleResult {
      status: "refused".into(),
      message: Some("Link does not point to the canonical skill path.".into()),
    });
  }

  remove_link(&link_path)?;

  if let Some(skill_links) = mappings.get_mut(&skill_name) {
    skill_links.remove(&target);
  }
  mappings.retain(|_, links| !links.is_empty());
  write_mappings_registry(&mappings_path, root, &mappings)?;
  Ok(SingleResult { status: "unmapped".into(), message: Some(format!("Unmapped '{}' from {}", skill_name, target)) })
}

fn adopt_skill_impl(root: &Path, skill_name: String, target: String) -> Result<SingleResult, String> {
  let (_, target_entries) = load_config(root);
  let profiles = resolve_targets(&target_entries);
  let profile = find_profile(&profiles, &target)
    .ok_or_else(|| format!("Unknown target: {target}"))?;
  let first_skill_dir = profile.skill_dirs.first()
    .ok_or_else(|| format!("No skill dirs for target: {target}"))?;
  let agent_skill_path = PathBuf::from(first_skill_dir).join(&skill_name);
  let project_skill_path = root.join("skills").join(&skill_name);

  if !project_skill_path.join("SKILL.md").exists() {
    return Ok(SingleResult {
      status: "not-found".into(),
      message: Some(format!("Skill '{}' not found at {}", skill_name, project_skill_path.display())),
    });
  }

  if !agent_skill_path.exists() {
    return Ok(SingleResult {
      status: "blocked".into(),
      message: Some(format!("No existing directory at {} to adopt", agent_skill_path.display())),
    });
  }

  if is_junction_or_symlink(&agent_skill_path) {
    if paths_resolve_same(&agent_skill_path, &project_skill_path) {
      return Ok(SingleResult {
        status: "already-linked".into(),
        message: Some(format!("'{}' is already linked to {}", skill_name, target)),
      });
    }
    return Ok(SingleResult {
      status: "blocked".into(),
      message: Some("Target is already a link that points elsewhere.".into()),
    });
  }

  let backup_path = root
    .join("backups")
    .join(chrono_timestamp())
    .join(&target)
    .join(&skill_name);
  copy_dir_recursive(&agent_skill_path, &backup_path)?;
  fs::remove_dir_all(&agent_skill_path)
    .map_err(|e| format!("Failed to remove adopted source directory: {e}"))?;
  create_junction_or_symlink(&project_skill_path, &agent_skill_path, &profile.link_mode)?;

  let mappings_path = root.join("registry").join("mappings.json");
  let mut mappings = read_mappings_raw(&mappings_path);
  let skill_links = mappings.entry(skill_name.clone()).or_default();
  let now = chrono_timestamp();
  skill_links.insert(
    target.clone(),
    serde_json::json!({
      "path": agent_skill_path.to_string_lossy().replace('\\', "/"),
      "mode": profile.link_mode,
      "status": "linked",
      "type": "standard",
      "linkedAt": now,
      "backupPath": backup_path.to_string_lossy().replace('\\', "/"),
      "updatedAt": now
    }),
  );
  write_mappings_registry(&mappings_path, root, &mappings)?;

  Ok(SingleResult {
    status: "adopted".into(),
    message: Some(format!("Adopted '{}' from {}", skill_name, target)),
  })
}

#[tauri::command]
pub fn map_batch(
  workspace_root: State<'_, PathBuf>,
  skill_names: Vec<String>,
  target: String,
) -> Result<BatchResult, String> {
  Ok(batch_operation(
    workspace_root.as_ref(),
    &skill_names,
    &target,
    map_skill_impl,
  ))
}

#[tauri::command]
pub fn unmap_batch(
  workspace_root: State<'_, PathBuf>,
  skill_names: Vec<String>,
  target: String,
) -> Result<BatchResult, String> {
  Ok(batch_operation(
    workspace_root.as_ref(),
    &skill_names,
    &target,
    unmap_skill_impl,
  ))
}

#[tauri::command]
pub fn adopt_batch(
  workspace_root: State<'_, PathBuf>,
  skill_names: Vec<String>,
  target: String,
) -> Result<BatchResult, String> {
  Ok(batch_operation(
    workspace_root.as_ref(),
    &skill_names,
    &target,
    adopt_skill_impl,
  ))
}

#[tauri::command]
pub fn run_doctor(workspace_root: State<'_, PathBuf>) -> Result<DoctorResult, String> {
  let root: &Path = &workspace_root;
  let mut issues = Vec::new();

  // Check config exists
  let config_path = root.join("skillgov.config.json");
  if !config_path.exists() {
    issues.push(DoctorIssue {
      severity: "warning".into(),
      message: "No skillgov.config.json found — using defaults.".into(),
    });
  }

  // Check skills directory
  let skills_dir = root.join("skills");
  if !skills_dir.exists() {
    issues.push(DoctorIssue {
      severity: "warning".into(),
      message: "No skills/ directory found.".into(),
    });
  }

  // Check registry
  let registry_path = root.join("registry").join("skills.json");
  if !registry_path.exists() {
    issues.push(DoctorIssue {
      severity: "warning".into(),
      message: "No registry/skills.json found.".into(),
    });
  }

  // Check target skill dirs
  let (_, target_entries) = load_config(root);
  let profiles = resolve_targets(&target_entries);
  for profile in &profiles {
    for skill_dir in &profile.skill_dirs {
      if !Path::new(skill_dir).exists() {
        issues.push(DoctorIssue {
          severity: "warning".into(),
          message: format!("Target skill dir does not exist: {}", skill_dir),
        });
      }
    }
  }

  Ok(DoctorResult { issues })
}

fn link_timestamp(link: &JsonValue) -> u128 {
  link
    .get("updatedAt")
    .or_else(|| link.get("linkedAt"))
    .and_then(JsonValue::as_str)
    .and_then(|s| s.parse::<u128>().ok())
    .unwrap_or(0)
}

fn latest_mapped_skill_for_target(mappings: &MappingLinks, target: &str) -> Option<String> {
  mappings
    .iter()
    .filter_map(|(skill_name, links)| {
      links
        .get(target)
        .filter(|link| !link.is_null())
        .map(|link| (skill_name.clone(), link_timestamp(link)))
    })
    .max_by_key(|(_, timestamp)| *timestamp)
    .map(|(skill_name, _)| skill_name)
}

#[tauri::command]
pub fn rollback_install(
  workspace_root: State<'_, PathBuf>,
  target: String,
) -> Result<SingleResult, String> {
  let root: &Path = &workspace_root;
  let mappings_path = root.join("registry").join("mappings.json");
  let mappings = read_mappings_raw(&mappings_path);

  let skill_name = latest_mapped_skill_for_target(&mappings, &target).ok_or_else(|| {
    format!("No mapped skills found for target: {target}")
  })?;

  unmap_skill(workspace_root, skill_name.clone(), target.clone())?;

  Ok(SingleResult {
    status: "rolled-back".into(),
    message: Some(format!("Rolled back '{}' from {}", skill_name, target)),
  })
}

#[tauri::command]
pub fn discover_import(workspace_root: State<'_, PathBuf>) -> Result<JsonValue, String> {
  let root: &Path = &workspace_root;
  let (_, _target_entries) = load_config(root);

  let registry_path = root.join("registry").join("skills.json");
  let imported = read_skills_registry(&registry_path);

  let mut total = 0u32;
  let mut imported_count = 0u32;
  let mut results = Vec::new();

  let skills_dir = root.join("skills");
  if skills_dir.exists() {
    if let Ok(entries) = fs::read_dir(&skills_dir) {
      for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name == ".system" || !entry.path().is_dir() {
          continue;
        }
        if !entry.path().join("SKILL.md").exists() {
          continue;
        }
        total += 1;
        if imported.contains_key(&name) {
          results.push(serde_json::json!({"name": name, "status": "already-imported"}));
        } else {
          // Add to registry
          let mut reg = read_skills_registry_json(&registry_path);
          if let Some(skills) = reg.pointer_mut("/skills").and_then(|v| v.as_object_mut()) {
            skills.insert(name.clone(), serde_json::json!({"origin": "local"}));
          }
          let content = serde_json::to_string_pretty(&reg).unwrap_or_default();
          let _ = fs::write(&registry_path, content);
          imported_count += 1;
          results.push(serde_json::json!({"name": name, "status": "imported"}));
        }
      }
    }
  }

  Ok(serde_json::json!({
    "total": total,
    "imported": imported_count,
    "results": results,
  }))
}

fn read_skills_registry_json(path: &Path) -> JsonValue {
  let raw = match fs::read_to_string(path) {
    Ok(r) => r,
    Err(_) => return serde_json::json!({"skills": {}}),
  };
  serde_json::from_str(&raw).unwrap_or_else(|_| serde_json::json!({"skills": {}}))
}

fn chrono_timestamp() -> String {
  // Simple timestamp without chrono dependency
  use std::time::{SystemTime, UNIX_EPOCH};
  let secs = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_secs();
  format!("{secs}")
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn unique_temp_dir(name: &str) -> PathBuf {
    let suffix = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap_or_default()
      .as_nanos();
    std::env::temp_dir().join(format!("skillgov-desktop-{name}-{suffix}"))
  }

  #[test]
  fn write_mappings_registry_preserves_core_schema() {
    let root = unique_temp_dir("schema-root");
    let registry_path = root.join("registry").join("mappings.json");
    let mut mappings: MappingLinks = HashMap::new();
    mappings.entry("alpha".into()).or_default().insert(
      "codex".into(),
      serde_json::json!({
        "path": "C:/Users/example/.codex/skills/alpha",
        "mode": "junction",
        "status": "linked",
        "type": "standard",
        "linkedAt": "123",
        "updatedAt": "123"
      }),
    );

    write_mappings_registry(&registry_path, &root, &mappings).expect("write mappings");

    let raw = fs::read_to_string(&registry_path).expect("read mappings");
    let json: JsonValue = serde_json::from_str(&raw).expect("parse mappings");
    let alpha = &json["mappings"]["alpha"];
    assert_eq!(alpha["skillName"], "alpha");
    assert!(alpha["canonicalPath"].as_str().unwrap().ends_with("/skills/alpha"));
    assert_eq!(alpha["links"]["codex"]["mode"], "junction");
    assert_eq!(alpha["links"]["codex"]["type"], "standard");

    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn read_mappings_raw_accepts_legacy_schema_without_links_wrapper() {
    let root = unique_temp_dir("legacy-schema-root");
    let registry_path = root.join("registry").join("mappings.json");
    fs::create_dir_all(registry_path.parent().unwrap()).expect("registry dir");
    fs::write(
      &registry_path,
      serde_json::json!({
        "mappings": {
          "alpha": {
            "codex": {
              "path": "C:/Users/example/.codex/skills/alpha",
              "mode": "junction",
              "status": "linked",
              "type": "standard",
              "linkedAt": "100",
              "updatedAt": "100"
            }
          }
        }
      })
      .to_string(),
    )
    .expect("write legacy mappings");

    let mappings = read_mappings_raw(&registry_path);

    assert_eq!(
      mappings["alpha"]["codex"]["path"],
      "C:/Users/example/.codex/skills/alpha"
    );
    assert_eq!(mappings["alpha"]["codex"]["type"], "standard");

    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn unmap_refuses_plain_directory_and_keeps_user_files() {
    let root = unique_temp_dir("unmap-root");
    let project_skill = root.join("skills").join("alpha");
    let target_root = root.join("agent-skills");
    let target_skill = target_root.join("alpha");
    fs::create_dir_all(&project_skill).expect("project skill dir");
    fs::create_dir_all(&target_skill).expect("target skill dir");
    fs::write(project_skill.join("SKILL.md"), "# managed").expect("project skill");
    fs::write(target_skill.join("SKILL.md"), "# local user copy").expect("target skill");
    fs::write(
      root.join("skillgov.config.json"),
      serde_json::json!({
        "projectRoot": root.to_string_lossy().replace('\\', "/"),
        "targets": [{
          "id": "local",
          "label": "Local",
          "skillDirs": [target_root.to_string_lossy().replace('\\', "/")],
          "linkMode": "junction"
        }]
      })
      .to_string(),
    )
    .expect("config");

    let result = unmap_skill_impl(&root, "alpha".into(), "local".into()).expect("unmap result");

    assert_eq!(result.status, "refused");
    assert!(target_skill.join("SKILL.md").exists());

    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn adopt_backs_up_plain_directory_before_replacing_it() {
    let root = unique_temp_dir("adopt-root");
    let project_skill = root.join("skills").join("alpha");
    let target_root = root.join("agent-skills");
    let target_skill = target_root.join("alpha");
    fs::create_dir_all(&project_skill).expect("project skill dir");
    fs::create_dir_all(&target_skill).expect("target skill dir");
    fs::write(project_skill.join("SKILL.md"), "# managed").expect("project skill");
    fs::write(target_skill.join("SKILL.md"), "# local user copy").expect("target skill");
    fs::write(
      root.join("skillgov.config.json"),
      serde_json::json!({
        "projectRoot": root.to_string_lossy().replace('\\', "/"),
        "targets": [{
          "id": "local",
          "label": "Local",
          "skillDirs": [target_root.to_string_lossy().replace('\\', "/")],
          "linkMode": "junction"
        }]
      })
      .to_string(),
    )
    .expect("config");

    let result = adopt_skill_impl(&root, "alpha".into(), "local".into()).expect("adopt result");

    assert_eq!(result.status, "adopted");
    assert!(root.join("backups").exists());
    assert!(paths_resolve_same(&target_skill, &project_skill));

    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn map_records_full_link_object() {
    let root = unique_temp_dir("map-root");
    let project_skill = root.join("skills").join("alpha");
    let target_root = root.join("agent-skills");
    fs::create_dir_all(&project_skill).expect("project skill dir");
    fs::write(project_skill.join("SKILL.md"), "# managed").expect("project skill");
    fs::write(
      root.join("skillgov.config.json"),
      serde_json::json!({
        "projectRoot": root.to_string_lossy().replace('\\', "/"),
        "targets": [{
          "id": "local",
          "label": "Local",
          "skillDirs": [target_root.to_string_lossy().replace('\\', "/")],
          "linkMode": "junction"
        }]
      })
      .to_string(),
    )
    .expect("config");

    let result = map_skill_impl(&root, "alpha".into(), "local".into()).expect("map result");
    assert_eq!(result.status, "mapped");

    let raw = fs::read_to_string(root.join("registry").join("mappings.json")).expect("mappings");
    let json: JsonValue = serde_json::from_str(&raw).expect("json");
    let link = &json["mappings"]["alpha"]["links"]["local"];
    assert_eq!(link["mode"], "junction");
    assert_eq!(link["status"], "linked");
    assert_eq!(link["type"], "standard");
    assert!(link["path"].as_str().unwrap().ends_with("/agent-skills/alpha"));

    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn latest_mapped_skill_uses_link_timestamp_not_hashmap_order() {
    let mut mappings: MappingLinks = HashMap::new();
    mappings.entry("old".into()).or_default().insert(
      "codex".into(),
      serde_json::json!({ "linkedAt": "100", "updatedAt": "100" }),
    );
    mappings.entry("new".into()).or_default().insert(
      "codex".into(),
      serde_json::json!({ "linkedAt": "200", "updatedAt": "200" }),
    );

    assert_eq!(latest_mapped_skill_for_target(&mappings, "codex"), Some("new".into()));
  }
}

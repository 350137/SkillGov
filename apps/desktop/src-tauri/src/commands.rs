// Tauri commands — Rust implementations of the control-panel API for desktop-native mode.
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

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

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSkillResult {
  pub id: String,
  pub skill_id: String,
  pub name: String,
  pub source: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub installs: Option<u64>,
  pub installed: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub validation_status: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSearchResponse {
  pub query: String,
  pub source: String,
  pub count: usize,
  pub skills: Vec<RemoteSkillResult>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSkillPreview {
  pub id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub name: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub description: Option<String>,
  pub file_count: usize,
  pub total_bytes: usize,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub remote_hash: Option<String>,
  pub status: String,
  pub issues: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInstallResult {
  pub status: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub skill_name: Option<String>,
  pub issues: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub message: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub origin: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct DownloadedSkillFile {
  path: String,
  contents: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct DownloadedSkillPayload {
  files: Vec<DownloadedSkillFile>,
  #[serde(skip_serializing_if = "Option::is_none")]
  hash: Option<String>,
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

fn is_safe_file_name(value: &str) -> bool {
  let mut chars = value.chars();
  match chars.next() {
    Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit() => {}
    _ => return false,
  }
  chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

fn ensure_safe_file_name(value: &str, label: &str) -> Result<(), String> {
  if is_safe_file_name(value) {
    return Ok(());
  }
  Err(format!(
    "{label} must be a safe file name using lowercase letters, numbers, dashes, and underscores."
  ))
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
  let mut merged: Vec<SkillCandidate> = by_name.into_values().collect();
  merged.sort_by(|a, b| a.name.cmp(&b.name));
  merged
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
  let content = match fs::read_to_string(&skill_md) {
    Ok(content) => content,
    Err(_) => return "fail".into(),
  };
  let mut lines = content.lines();
  if lines.next().map(str::trim) != Some("---") {
    return "fail".into();
  }

  let mut frontmatter: HashMap<String, String> = HashMap::new();
  let mut closed = false;
  for line in lines.by_ref() {
    let trimmed = line.trim();
    if trimmed == "---" {
      closed = true;
      break;
    }
    if trimmed.is_empty() {
      continue;
    }
    let Some((raw_key, raw_value)) = trimmed.split_once(':') else {
      return "fail".into();
    };
    let key = raw_key.trim();
    if key.is_empty() {
      return "fail".into();
    }
    frontmatter.insert(key.to_string(), raw_value.trim().trim_matches('"').to_string());
  }
  if !closed {
    return "fail".into();
  }

  let Some(name) = frontmatter.get("name").filter(|value| !value.is_empty()) else {
    return "fail".into();
  };
  if frontmatter
    .get("description")
    .filter(|value| !value.is_empty())
    .is_none()
  {
    return "fail".into();
  }
  if !is_safe_file_name(name) {
    return "fail".into();
  }

  if path.file_name().and_then(|part| part.to_str()) != Some(name.as_str()) {
    return "fixable".into();
  }
  "pass".into()
}

const SKILLS_API_BASE: &str = "https://skills.sh/api";
const MAX_REMOTE_QUERY_LENGTH: usize = 100;
const DEFAULT_REMOTE_LIMIT: u32 = 20;
const MIN_REMOTE_LIMIT: u32 = 1;
const MAX_REMOTE_LIMIT: u32 = 50;
const MAX_REMOTE_FILES: usize = 100;
const MAX_REMOTE_FILE_BYTES: usize = 512 * 1024;
const MAX_REMOTE_TOTAL_BYTES: usize = 2 * 1024 * 1024;

struct PayloadValidation {
  status: String,
  issues: Vec<String>,
  file_count: usize,
  total_bytes: usize,
  skill_md: Option<String>,
}

fn normalize_remote_query(query: &str, limit: Option<u32>) -> Result<(String, u32), String> {
  let normalized = query.trim().to_string();
  if normalized.is_empty() {
    return Err("Remote search query is required.".into());
  }
  if normalized.len() > MAX_REMOTE_QUERY_LENGTH {
    return Err(format!(
      "Remote search query must be {MAX_REMOTE_QUERY_LENGTH} characters or fewer."
    ));
  }
  let raw_limit = limit.unwrap_or(DEFAULT_REMOTE_LIMIT);
  let clamped = raw_limit.clamp(MIN_REMOTE_LIMIT, MAX_REMOTE_LIMIT);
  Ok((normalized, clamped))
}

fn validate_remote_skill_id(remote_id: &str) -> Result<String, String> {
  let normalized = remote_id.trim();
  let invalid_message =
    "Remote skill ID must use safe path-like segments without traversal or absolute paths.";
  if normalized.is_empty() || normalized.len() > 240 {
    return Err(invalid_message.into());
  }
  if normalized.contains('\\')
    || normalized.starts_with('/')
    || normalized
      .chars()
      .nth(1)
      .is_some_and(|c| c == ':' && normalized.len() > 2)
  {
    return Err(invalid_message.into());
  }

  for segment in normalized.split('/') {
    let mut chars = segment.chars();
    match chars.next() {
      Some(c) if c.is_ascii_alphanumeric() => {}
      _ => return Err(invalid_message.into()),
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-') {
      return Err(invalid_message.into());
    }
  }
  Ok(normalized.to_string())
}

fn safe_downloaded_file_path(staging_dir: &Path, downloaded_path: &str) -> Result<PathBuf, String> {
  let segments = validate_downloaded_path(downloaded_path)?;
  let mut resolved = staging_dir.to_path_buf();
  for segment in segments {
    resolved.push(segment);
  }
  if !resolved.starts_with(staging_dir) {
    return Err(format!("Unsafe downloaded file path: {downloaded_path}"));
  }
  Ok(resolved)
}

fn validate_downloaded_payload(payload: &DownloadedSkillPayload) -> PayloadValidation {
  let mut issues = Vec::new();
  let mut total_bytes = 0usize;
  let mut skill_md: Option<String> = None;

  if payload.files.len() > MAX_REMOTE_FILES {
    issues.push(format!(
      "Downloaded skill payload contains too many files; max is {MAX_REMOTE_FILES}."
    ));
  }

  for file in &payload.files {
    if validate_downloaded_path(&file.path).is_err() {
      issues.push(format!("Unsafe downloaded file path: {}", file.path));
    }
    let byte_len = file.contents.as_bytes().len();
    total_bytes += byte_len;
    if byte_len > MAX_REMOTE_FILE_BYTES {
      issues.push(format!("Downloaded file is too large: {}", file.path));
    }
    if file.path == "SKILL.md" {
      skill_md = Some(file.contents.clone());
    }
  }

  if total_bytes > MAX_REMOTE_TOTAL_BYTES {
    issues.push(format!(
      "Downloaded skill payload is too large; max is {MAX_REMOTE_TOTAL_BYTES} bytes."
    ));
  }
  if skill_md.is_none() {
    issues.push("Downloaded skill payload must include a root SKILL.md file.".into());
  }

  PayloadValidation {
    status: if issues.is_empty() { "pass" } else { "fail" }.into(),
    issues,
    file_count: payload.files.len(),
    total_bytes,
    skill_md,
  }
}

fn validate_downloaded_path(downloaded_path: &str) -> Result<Vec<&str>, String> {
  if downloaded_path.is_empty()
    || downloaded_path.contains('\\')
    || downloaded_path.starts_with('/')
    || downloaded_path.contains(':')
  {
    return Err(format!("Unsafe downloaded file path: {downloaded_path}"));
  }
  let segments: Vec<&str> = downloaded_path.split('/').collect();
  if segments.iter().any(|segment| {
    segment.is_empty()
      || *segment == "."
      || *segment == ".."
      || segment
        .chars()
        .any(|c| matches!(c, '<' | '>' | '"' | '|' | '?' | '*') || c.is_control())
  }) {
    return Err(format!("Unsafe downloaded file path: {downloaded_path}"));
  }
  Ok(segments)
}

fn parse_skill_md_frontmatter(content: &str) -> (HashMap<String, String>, Vec<String>) {
  let mut data = HashMap::new();
  let mut errors = Vec::new();
  if !content.starts_with("---") {
    errors.push("Root SKILL.md must start with frontmatter.".into());
    return (data, errors);
  }
  let Some(end_index) = content[3..].find("---").map(|idx| idx + 3) else {
    errors.push("Root SKILL.md frontmatter is not closed.".into());
    return (data, errors);
  };
  let raw = content[3..end_index].trim();
  for line in raw.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }
    let Some((raw_key, raw_value)) = trimmed.split_once(':') else {
      errors.push(format!("Unparseable frontmatter line: \"{trimmed}\""));
      continue;
    };
    let key = raw_key.trim();
    if key.is_empty() {
      errors.push(format!("Unparseable frontmatter line: \"{trimmed}\""));
      continue;
    }
    data.insert(key.to_string(), strip_quotes(raw_value.trim()));
  }
  (data, errors)
}

fn strip_quotes(value: &str) -> String {
  let trimmed = value.trim();
  if (trimmed.starts_with('"') && trimmed.ends_with('"'))
    || (trimmed.starts_with('\'') && trimmed.ends_with('\''))
  {
    return trimmed[1..trimmed.len() - 1].to_string();
  }
  trimmed.to_string()
}

fn http_get_json(url: &str) -> Result<JsonValue, String> {
  let client = reqwest::blocking::Client::builder()
    .timeout(Duration::from_secs(10))
    .build()
    .map_err(|e| format!("Failed to create remote skill HTTP client: {e}"))?;
  let response = client
    .get(url)
    .send()
    .map_err(|e| format!("Remote skill request failed: {e}"))?;
  let status = response.status();
  if !status.is_success() {
    return Err(format!("Remote skill request failed with HTTP {status}"));
  }
  response
    .json::<JsonValue>()
    .map_err(|e| format!("Remote skill response was invalid JSON: {e}"))
}

fn download_remote_payload(remote_id: &str) -> Result<DownloadedSkillPayload, String> {
  let id = validate_remote_skill_id(remote_id)?;
  let url = format!("{SKILLS_API_BASE}/download/{id}");
  let json = http_get_json(&url)?;
  serde_json::from_value::<DownloadedSkillPayload>(json)
    .map_err(|e| format!("Remote skill download response was invalid: {e}"))
}

fn preview_remote_payload(remote_id: &str, payload: &DownloadedSkillPayload) -> RemoteSkillPreview {
  let id = validate_remote_skill_id(remote_id).unwrap_or_else(|_| remote_id.to_string());
  let validation = validate_downloaded_payload(payload);
  let (frontmatter, fm_errors) = validation
    .skill_md
    .as_deref()
    .map(parse_skill_md_frontmatter)
    .unwrap_or_default();
  let mut issues = validation.issues.clone();
  issues.extend(fm_errors);
  if validation.status == "pass" && !frontmatter.contains_key("name") {
    issues.push("Root SKILL.md frontmatter must include a name.".into());
  }
  if validation.status == "pass" && !frontmatter.contains_key("description") {
    issues.push("Root SKILL.md frontmatter must include a description.".into());
  }
  RemoteSkillPreview {
    id,
    name: frontmatter.get("name").cloned(),
    description: frontmatter.get("description").cloned(),
    file_count: validation.file_count,
    total_bytes: validation.total_bytes,
    remote_hash: payload.hash.clone(),
    status: if issues.is_empty() { "pass" } else { "fail" }.into(),
    issues,
  }
}

fn install_remote_payload_impl(
  root: &Path,
  remote_id: &str,
  payload: DownloadedSkillPayload,
) -> Result<RemoteInstallResult, String> {
  let id = validate_remote_skill_id(remote_id)?;
  let origin = format!("remote:skills.sh:{id}");
  let preview = preview_remote_payload(&id, &payload);
  let skill_name = preview.name.clone();
  if preview.status != "pass" {
    return Ok(RemoteInstallResult {
      status: "fail".into(),
      skill_name,
      issues: preview.issues,
      message: None,
      origin: Some(origin),
    });
  }
  let Some(skill_name) = skill_name else {
    return Ok(RemoteInstallResult {
      status: "fail".into(),
      skill_name: None,
      issues: vec!["Root SKILL.md frontmatter must include a name.".into()],
      message: None,
      origin: Some(origin),
    });
  };
  if !is_safe_file_name(&skill_name) {
    return Ok(RemoteInstallResult {
      status: "fail".into(),
      skill_name: Some(skill_name),
      issues: vec!["Root SKILL.md frontmatter name must be a safe local skill name.".into()],
      message: None,
      origin: Some(origin),
    });
  }

  let incoming_dir = root.join("incoming");
  let remote_downloads_dir = incoming_dir.join(".remote-downloads");
  let temp_root = remote_downloads_dir.join(safe_remote_staging_name(&id));
  let source_dir = temp_root.join(&skill_name);
  let skills_dir = root.join("skills");
  let final_skill_dir = skills_dir.join(&skill_name);
  let existed = final_skill_dir.exists();

  let result = (|| {
    fs::create_dir_all(&source_dir)
      .map_err(|e| format!("Failed to create remote staging directory: {e}"))?;
    for file in &payload.files {
      let target = safe_downloaded_file_path(&source_dir, &file.path)?;
      if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
          .map_err(|e| format!("Failed to create remote staged directory: {e}"))?;
      }
      fs::write(&target, &file.contents)
        .map_err(|e| format!("Failed to write remote staged file: {e}"))?;
    }

    let validation_status = validate_skill_path(&source_dir.to_string_lossy());
    if validation_status == "fail" {
      return Ok(RemoteInstallResult {
        status: "fail".into(),
        skill_name: Some(skill_name.clone()),
        issues: vec!["Skill validation failed after staging.".into()],
        message: None,
        origin: Some(origin.clone()),
      });
    }
    if validation_status == "fixable" {
      return Ok(RemoteInstallResult {
        status: "fixable".into(),
        skill_name: Some(skill_name.clone()),
        issues: vec!["Skill requires repair after staging.".into()],
        message: None,
        origin: Some(origin.clone()),
      });
    }

    fs::create_dir_all(&skills_dir)
      .map_err(|e| format!("Failed to create skills directory: {e}"))?;
    if final_skill_dir.exists() {
      fs::remove_dir_all(&final_skill_dir)
        .map_err(|e| format!("Failed to replace existing skill: {e}"))?;
    }
    copy_dir_recursive(&source_dir, &final_skill_dir)?;
    write_remote_skill_registry(root, &skill_name, &origin)?;

    Ok(RemoteInstallResult {
      status: "pass".into(),
      skill_name: Some(skill_name.clone()),
      issues: vec![],
      message: Some(if existed {
        format!("Replaced existing managed skill \"{skill_name}\".")
      } else {
        format!("Installed remote skill \"{skill_name}\".")
      }),
      origin: Some(origin.clone()),
    })
  })();

  let _ = fs::remove_dir_all(&temp_root);
  remove_dir_if_empty(&remote_downloads_dir);
  result
}

fn write_remote_skill_registry(root: &Path, skill_name: &str, origin: &str) -> Result<(), String> {
  let registry_path = root.join("registry").join("skills.json");
  let mut registry = read_skills_registry_json(&registry_path);
  if registry.get("skills").and_then(JsonValue::as_object).is_none() {
    registry["skills"] = serde_json::json!({});
  }
  if let Some(skills) = registry.get_mut("skills").and_then(JsonValue::as_object_mut) {
    skills.insert(
      skill_name.to_string(),
      serde_json::json!({
        "name": skill_name,
        "sourcePath": origin,
        "origin": origin,
        "importedAt": chrono_timestamp(),
        "validationStatus": "pass"
      }),
    );
  }
  if let Some(parent) = registry_path.parent() {
    fs::create_dir_all(parent)
      .map_err(|e| format!("Failed to create registry directory: {e}"))?;
  }
  let content = serde_json::to_string_pretty(&registry)
    .map_err(|e| format!("Failed to serialize skills registry: {e}"))?;
  fs::write(&registry_path, content)
    .map_err(|e| format!("Failed to write skills registry: {e}"))?;
  Ok(())
}

fn safe_remote_staging_name(remote_id: &str) -> String {
  remote_id.replace(['/', '.'], "_")
}

fn remove_dir_if_empty(dir: &Path) {
  if let Ok(mut entries) = fs::read_dir(dir) {
    if entries.next().is_none() {
      let _ = fs::remove_dir_all(dir);
    }
  }
}

#[tauri::command]
pub fn search_remote_skills(
  workspace_root: State<'_, PathBuf>,
  query: String,
  limit: Option<u32>,
) -> Result<RemoteSearchResponse, String> {
  let (query, limit) = normalize_remote_query(&query, limit)?;
  let mut url = reqwest::Url::parse(&format!("{SKILLS_API_BASE}/search"))
    .map_err(|e| format!("Failed to build remote search URL: {e}"))?;
  url
    .query_pairs_mut()
    .append_pair("q", &query)
    .append_pair("limit", &limit.to_string());
  let raw = http_get_json(url.as_str())?;
  let remote_skills = raw
    .get("skills")
    .and_then(JsonValue::as_array)
    .ok_or_else(|| "Remote skill search returned an invalid response.".to_string())?;
  let installed = installed_remote_statuses(workspace_root.as_ref());
  let mut skills = Vec::new();

  for item in remote_skills {
    let Some(id) = item.get("id").and_then(JsonValue::as_str) else {
      continue;
    };
    let Ok(id) = validate_remote_skill_id(id) else {
      continue;
    };
    let Some(skill_id) = item.get("skillId").and_then(JsonValue::as_str) else {
      continue;
    };
    let Some(name) = item.get("name").and_then(JsonValue::as_str) else {
      continue;
    };
    let Some(source) = item.get("source").and_then(JsonValue::as_str) else {
      continue;
    };
    let validation_status = installed.get(name).cloned();
    skills.push(RemoteSkillResult {
      id,
      skill_id: skill_id.into(),
      name: name.into(),
      source: source.into(),
      installs: item.get("installs").and_then(JsonValue::as_u64),
      installed: validation_status.is_some(),
      validation_status,
    });
  }

  Ok(RemoteSearchResponse {
    query,
    source: "skills.sh".into(),
    count: skills.len(),
    skills,
  })
}

#[tauri::command]
pub fn preview_remote_skill(remote_id: String) -> Result<RemoteSkillPreview, String> {
  let id = validate_remote_skill_id(&remote_id)?;
  let payload = download_remote_payload(&id)?;
  Ok(preview_remote_payload(&id, &payload))
}

#[tauri::command]
pub fn install_remote_skill(
  workspace_root: State<'_, PathBuf>,
  remote_id: String,
) -> Result<RemoteInstallResult, String> {
  let id = validate_remote_skill_id(&remote_id)?;
  let payload = download_remote_payload(&id)?;
  install_remote_payload_impl(workspace_root.as_ref(), &id, payload)
}

fn installed_remote_statuses(root: &Path) -> HashMap<String, String> {
  let mut result = HashMap::new();
  let (skills, _) = scan_skill_dir(&root.join("skills"), "project");
  for skill in skills {
    result.insert(skill.name, validate_skill_path(&skill.path));
  }
  result
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
  ensure_safe_file_name(&skill_name, "Skill name")?;
  ensure_safe_file_name(&target, "Target name")?;
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
  ensure_safe_file_name(&skill_name, "Skill name")?;
  ensure_safe_file_name(&target, "Target name")?;
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
  ensure_safe_file_name(&skill_name, "Skill name")?;
  ensure_safe_file_name(&target, "Target name")?;
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
  ensure_safe_file_name(&target, "Target name")?;
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
  fn map_rejects_unsafe_skill_name_before_resolving_paths() {
    let root = unique_temp_dir("unsafe-map-root");
    let escaped_skill = root.join("escape");
    let target_root = root.join("agent-skills");
    fs::create_dir_all(&escaped_skill).expect("escaped skill dir");
    fs::write(escaped_skill.join("SKILL.md"), "# escaped").expect("escaped skill");
    fs::write(
      root.join("skillgov.config.json"),
      serde_json::json!({
        "projectRoot": root.to_string_lossy().replace('\\', "/"),
        "targets": [{
          "id": "local",
          "label": "Local",
          "skillDirs": [target_root.to_string_lossy().replace('\\', "/")],
          "linkMode": "copy"
        }]
      })
      .to_string(),
    )
    .expect("config");

    let result = map_skill_impl(&root, "../escape".into(), "local".into());

    assert!(result
      .expect_err("unsafe skill name should be rejected")
      .contains("safe file name"));

    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn merge_candidates_returns_skills_sorted_by_name() {
    let merged = merge_candidates(vec![
      SkillCandidate {
        name: "zeta-skill".into(),
        path: "zeta".into(),
        source: "agent".into(),
      },
      SkillCandidate {
        name: "alpha-skill".into(),
        path: "alpha".into(),
        source: "agent".into(),
      },
      SkillCandidate {
        name: "middle-skill".into(),
        path: "middle".into(),
        source: "project".into(),
      },
    ]);

    let names: Vec<String> = merged.into_iter().map(|skill| skill.name).collect();
    assert_eq!(names, vec!["alpha-skill", "middle-skill", "zeta-skill"]);
  }

  #[test]
  fn validate_skill_path_rejects_invalid_skill_metadata() {
    let root = unique_temp_dir("invalid-skill-validation-root");
    let missing_description = root.join("missing-description");
    let mismatched_name = root.join("mismatched-name");
    fs::create_dir_all(&missing_description).expect("missing description dir");
    fs::create_dir_all(&mismatched_name).expect("mismatched name dir");
    fs::write(
      missing_description.join("SKILL.md"),
      "---\nname: missing-description\n---\n\n# Missing description\n",
    )
    .expect("missing description skill");
    fs::write(
      mismatched_name.join("SKILL.md"),
      "---\nname: other-name\ndescription: mismatch\n---\n\n# Mismatch\n",
    )
    .expect("mismatched skill");

    assert_eq!(validate_skill_path(&missing_description.to_string_lossy()), "fail");
    assert_eq!(validate_skill_path(&mismatched_name.to_string_lossy()), "fixable");

    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn remote_safe_downloaded_file_path_rejects_unsafe_paths() {
    let root = unique_temp_dir("remote-path-root");
    let staging = root.join("incoming").join(".remote-downloads").join("remote-test");

    assert!(safe_downloaded_file_path(&staging, "docs/guide.md").is_ok());
    assert!(safe_downloaded_file_path(&staging, "../outside.md").is_err());
    assert!(safe_downloaded_file_path(&staging, "C:/outside.md").is_err());
    assert!(safe_downloaded_file_path(&staging, "docs\\outside.md").is_err());
    assert!(safe_downloaded_file_path(&staging, "docs/bad:name.md").is_err());

    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn remote_install_rejects_invalid_skill_metadata() {
    let root = unique_temp_dir("remote-invalid-root");
    let payload = DownloadedSkillPayload {
      files: vec![DownloadedSkillFile {
        path: "SKILL.md".into(),
        contents: "---\nname: broken-skill\n---\n\n# Missing description\n".into(),
      }],
      hash: Some("abc123".into()),
    };

    let result =
      install_remote_payload_impl(&root, "github/example/broken-skill", payload).expect("install");

    assert_eq!(result.status, "fail");
    assert!(result.issues.join("\n").contains("description"));
    assert!(!root.join("skills").join("broken-skill").exists());
    assert!(!root.join("incoming").join(".remote-downloads").exists());

    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn remote_install_promotes_valid_payload_and_updates_registry() {
    let root = unique_temp_dir("remote-valid-root");
    let payload = DownloadedSkillPayload {
      files: vec![
        DownloadedSkillFile {
          path: "SKILL.md".into(),
          contents:
            "---\nname: remote-test\ndescription: a remote test skill\n---\n\n# Remote\n".into(),
        },
        DownloadedSkillFile {
          path: "docs/guide.md".into(),
          contents: "Use this skill.".into(),
        },
      ],
      hash: Some("abc123".into()),
    };

    let result =
      install_remote_payload_impl(&root, "github/example/remote-test", payload).expect("install");

    assert_eq!(result.status, "pass");
    assert_eq!(result.skill_name.as_deref(), Some("remote-test"));
    assert!(root.join("skills").join("remote-test").join("SKILL.md").exists());
    assert!(root
      .join("skills")
      .join("remote-test")
      .join("docs")
      .join("guide.md")
      .exists());
    assert!(!root.join("incoming").join(".remote-downloads").exists());
    let raw = fs::read_to_string(root.join("registry").join("skills.json")).expect("registry");
    let json: JsonValue = serde_json::from_str(&raw).expect("registry json");
    assert_eq!(
      json["skills"]["remote-test"]["origin"],
      "remote:skills.sh:github/example/remote-test"
    );

    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn remote_install_rejects_traversal_without_writing_outside_project() {
    let root = unique_temp_dir("remote-traversal-root");
    let payload = DownloadedSkillPayload {
      files: vec![
        DownloadedSkillFile {
          path: "SKILL.md".into(),
          contents:
            "---\nname: escape-skill\ndescription: traversal test\n---\n\n# Escape\n".into(),
        },
        DownloadedSkillFile {
          path: "../outside.txt".into(),
          contents: "escape".into(),
        },
      ],
      hash: Some("abc123".into()),
    };

    let result =
      install_remote_payload_impl(&root, "github/example/escape-skill", payload).expect("install");

    assert_eq!(result.status, "fail");
    assert!(result.issues.join("\n").contains("Unsafe"));
    assert!(!root.join("outside.txt").exists());
    assert!(!root.join("skills").join("escape-skill").exists());

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

<!-- Implementation plan for fixing desktop native mapping safety and registry compatibility. -->
# Desktop Mapping Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Tauri desktop native commands preserve the shared SkillGov mapping registry schema and refuse destructive filesystem operations on unmanaged user skill directories.

**Architecture:** Keep the fix surgical inside the existing desktop Rust crate. Update `apps/desktop/src-tauri/src/commands.rs` to match the already-tested TypeScript core semantics for mapping registry shape, link detection, unmap safety, adopt safety, and deterministic rollback. Restore debug-only console behavior in `apps/desktop/src-tauri/src/main.rs`, and update stale desktop documentation.

**Tech Stack:** Rust 2021, Tauri 2, serde_json, PowerShell build scripts, Vitest/Biome for the TypeScript workspace.

---

## File Structure

- Modify `apps/desktop/src-tauri/src/commands.rs`: fix mapping registry read/write helpers, link detection, unmap/adopt behavior, deterministic rollback helper, and add Rust unit tests in a `#[cfg(test)]` module.
- Modify `apps/desktop/src-tauri/src/main.rs`: restore `cfg_attr(not(debug_assertions), windows_subsystem = "windows")`.
- Modify `README.md`: update desktop shell description to embedded SPA/no HTTP server.
- Modify `apps/desktop/README.md`: update development and local exe notes to embedded SPA/no port 4280 server.

---

### Task 1: Preserve `mappings.json` Schema

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Add a failing unit test for the registry writer**

Add this test module near the bottom of `commands.rs`, before `chrono_timestamp()` or after it if keeping helpers above tests is cleaner:

```rust
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
}
```

- [ ] **Step 2: Run the failing test**

Run from `apps/desktop/src-tauri`:

```bash
cargo test write_mappings_registry_preserves_core_schema
```

Expected: fail because `MappingLinks` does not exist yet or because the writer emits `mappings.alpha.codex` instead of `mappings.alpha.links.codex`.

- [ ] **Step 3: Introduce a shared mapping type and schema-preserving writer**

In `commands.rs`, add this alias near the registry helpers:

```rust
type MappingLinks = HashMap<String, HashMap<String, JsonValue>>;
```

Change `write_mappings_registry` to this implementation:

```rust
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
```

Update `read_mappings_raw` to return `MappingLinks`:

```rust
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
      let mut links = HashMap::new();
      if let Some(mapping_links) = mapping.get("links").and_then(JsonValue::as_object) {
        for (target, link) in mapping_links {
          links.insert(target.clone(), link.clone());
        }
      }
      if !links.is_empty() {
        result.insert(skill_name.clone(), links);
      }
    }
  }
  result
}
```

- [ ] **Step 4: Update all writer call sites**

Replace each call:

```rust
write_mappings_registry(&mappings_path, &mappings)?;
```

with:

```rust
write_mappings_registry(&mappings_path, root, &mappings)?;
```

Expected call sites are in `map_skill_impl`, `unmap_skill_impl`, and `adopt_skill_impl`.

- [ ] **Step 5: Run the schema test**

Run:

```bash
cargo test write_mappings_registry_preserves_core_schema
```

Expected: pass.

---

### Task 2: Refuse Unmap on Plain Directories

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Add a failing unmap safety test**

Add this test inside the `tests` module:

```rust
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
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cargo test unmap_refuses_plain_directory_and_keeps_user_files
```

Expected: fail because the current code deletes the plain directory and returns `unmapped`.

- [ ] **Step 3: Fix link detection to inspect the link itself**

Replace the Windows branch in `is_junction_or_symlink`:

```rust
if let Ok(meta) = fs::metadata(path) {
```

with:

```rust
if let Ok(meta) = fs::symlink_metadata(path) {
```

Keep the existing reparse point check.

- [ ] **Step 4: Make `paths_resolve_same` Windows case-insensitive**

Replace `paths_resolve_same` with:

```rust
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
```

- [ ] **Step 5: Restrict `remove_link` to managed links only**

Replace the plain-directory delete branch:

```rust
} else {
  fs::remove_dir_all(link)
    .map_err(|e| format!("Failed to remove directory: {e}"))?;
}
```

with:

```rust
} else {
  return Err(format!(
    "Refusing to remove plain directory: {}",
    link.display()
  ));
}
```

- [ ] **Step 6: Refuse unsafe unmap before deletion**

In `unmap_skill_impl`, replace the `if link_path.exists() { remove_link(&link_path)?; }` block with:

```rust
if !link_path.exists() {
  let mappings_path = root.join("registry").join("mappings.json");
  let mut mappings = read_mappings_raw(&mappings_path);
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
```

Keep the existing mapping removal after this block, but add:

```rust
mappings.retain(|_, links| !links.is_empty());
```

before writing.

- [ ] **Step 7: Run the unmap test**

Run:

```bash
cargo test unmap_refuses_plain_directory_and_keeps_user_files
```

Expected: pass.

---

### Task 3: Make Adopt Atomic and Backup User Directories

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Add a failing adopt test**

Add this test inside the `tests` module:

```rust
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
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cargo test adopt_backs_up_plain_directory_before_replacing_it
```

Expected: fail because current adopt leaves the target plain directory in place and then link creation fails.

- [ ] **Step 3: Replace `adopt_skill_impl` with safe adopt semantics**

Use this structure for `adopt_skill_impl`:

```rust
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
```

- [ ] **Step 4: Run the adopt test**

Run:

```bash
cargo test adopt_backs_up_plain_directory_before_replacing_it
```

Expected: pass.

---

### Task 4: Write Full Link Objects in Map

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Add a map registry test**

Add this test inside the `tests` module:

```rust
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
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cargo test map_records_full_link_object
```

Expected: fail until map writes `path`, `mode`, `status`, `type`, `linkedAt`, and `updatedAt` under `links[target]`.

- [ ] **Step 3: Update `map_skill_impl` insertion**

Replace the current `skill_links.insert(...)` with:

```rust
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
```

- [ ] **Step 4: Run the map registry test**

Run:

```bash
cargo test map_records_full_link_object
```

Expected: pass.

---

### Task 5: Make Desktop Rollback Deterministic

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Add a helper test**

Add this test inside the `tests` module:

```rust
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
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cargo test latest_mapped_skill_uses_link_timestamp_not_hashmap_order
```

Expected: fail because the helper does not exist yet.

- [ ] **Step 3: Add timestamp helpers**

Add these helpers near `rollback_install`:

```rust
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
```

- [ ] **Step 4: Update `rollback_install`**

Replace the `last_skill` HashMap iteration with:

```rust
let skill_name = latest_mapped_skill_for_target(&mappings, &target).ok_or_else(|| {
  format!("No mapped skills found for target: {target}")
})?;
```

Keep the existing call to unmap, now guarded by Task 2.

- [ ] **Step 5: Run the rollback helper test**

Run:

```bash
cargo test latest_mapped_skill_uses_link_timestamp_not_hashmap_order
```

Expected: pass.

---

### Task 6: Restore Debug Console Behavior and Update Docs

**Files:**
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Modify: `README.md`
- Modify: `apps/desktop/README.md`

- [ ] **Step 1: Restore debug-only subsystem attribute**

In `main.rs`, replace:

```rust
#![windows_subsystem = "windows"]
```

with:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

- [ ] **Step 2: Update desktop docs**

In `apps/desktop/README.md`, replace the port/server language with embedded SPA language:

```markdown
The desktop shell loads the built control panel SPA directly through Tauri.
It does not start the legacy HTTP control panel server.
```

Replace the local exe note:

```markdown
Double-click `SkillGov.exe` to open the desktop shell. It loads the embedded
SPA in a native window and should not spawn Node.js, pnpm, tsx, or an HTTP
server on port 4280.
```

In `README.md`, update the desktop section to say the same thing:

```markdown
The desktop shell does not create a second UI and does not start the local HTTP
server. It builds the control panel SPA and loads it directly in a native Tauri
window.
```

- [ ] **Step 3: Check first-line comment rule**

Run:

```bash
Get-Content apps\desktop\src-tauri\src\main.rs -TotalCount 1
Get-Content apps\desktop\src-tauri\src\commands.rs -TotalCount 1
Get-Content README.md -TotalCount 1
Get-Content apps\desktop\README.md -TotalCount 1
```

Expected: each file starts with a comment. Markdown files should start with an HTML comment.

---

### Task 7: Full Verification

**Files:**
- No code changes.

- [ ] **Step 1: Run desktop Rust tests**

Run from `apps/desktop/src-tauri`:

```bash
cargo test
```

Expected: all Rust tests pass. If rustup cannot find a toolchain from the repository root, stay inside `apps/desktop/src-tauri` so `rust-toolchain.toml` is discovered.

- [ ] **Step 2: Run TypeScript workspace tests**

Run from repository root:

```bash
corepack pnpm test
```

Expected: Vitest passes all files.

- [ ] **Step 3: Run lint**

Run:

```bash
corepack pnpm lint
```

Expected: Biome reports no errors.

- [ ] **Step 4: Check diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; changed files are limited to the files listed in this plan unless test tooling creates ignored build artifacts.

---

### Task 8: Commit and Push

**Files:**
- Modified files from Tasks 1-6.

- [ ] **Step 1: Stage the scoped changes**

Run:

```bash
git add apps/desktop/src-tauri/src/commands.rs apps/desktop/src-tauri/src/main.rs README.md apps/desktop/README.md
```

- [ ] **Step 2: Commit with a specific message**

Run:

```bash
git commit -m "fix: harden desktop mapping commands"
```

- [ ] **Step 3: Push**

Run:

```bash
git push
```

Expected: branch `main` pushes successfully, unless the user asks to use a separate branch or PR flow.

---

## Self-Review

- Spec coverage: covers registry schema corruption, unsafe unmap deletion, broken adopt flow, nondeterministic rollback, debug console attribute, stale docs, and verification/commit/push requirement.
- Placeholder scan: no TBD/TODO/implement-later placeholders remain.
- Type consistency: all new Rust snippets use `MappingLinks = HashMap<String, HashMap<String, JsonValue>>`, existing `SingleResult`, existing helper names, and existing `chrono_timestamp()`.

// Desktop shell — launches a native Tauri window loading the embedded React SPA, no HTTP server required.
use std::path::{Path, PathBuf};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub fn run() {
  let workspace_root = workspace_root_from_manifest_dir(Path::new(env!("CARGO_MANIFEST_DIR")))
    .expect("failed to resolve SkillGov workspace root");

  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      crate::commands::get_status,
      crate::commands::list_targets,
      crate::commands::discover_skills,
      crate::commands::discover_import,
      crate::commands::check_compat,
      crate::commands::compat_batch,
      crate::commands::map_skill,
      crate::commands::unmap_skill,
      crate::commands::adopt_skill,
      crate::commands::map_batch,
      crate::commands::unmap_batch,
      crate::commands::adopt_batch,
      crate::commands::run_doctor,
      crate::commands::rollback_install,
    ])
    .setup(move |app| {
      app.manage(workspace_root);
      create_main_window(app)?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running SkillGov desktop shell");
}

pub fn workspace_root_from_manifest_dir(manifest_dir: &Path) -> Result<PathBuf, String> {
  manifest_dir
    .parent()
    .and_then(Path::parent)
    .and_then(Path::parent)
    .map(Path::to_path_buf)
    .ok_or_else(|| format!("Could not resolve workspace root from {}", manifest_dir.display()))
}

fn create_main_window(app: &mut tauri::App) -> tauri::Result<()> {
  WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/".into()))
    .title("SkillGov")
    .inner_size(1365.0, 900.0)
    .min_inner_size(960.0, 640.0)
    .resizable(true)
    .center()
    .build()?;

  Ok(())
}

#[cfg(test)]
mod tests {
  use std::path::Path;

  use super::*;

  #[test]
  fn resolves_workspace_root_from_src_tauri_manifest_dir() {
    let root = workspace_root_from_manifest_dir(Path::new("D:/SkillGov/apps/desktop/src-tauri"))
      .expect("workspace root");

    assert_eq!(root, Path::new("D:/SkillGov"));
  }
}

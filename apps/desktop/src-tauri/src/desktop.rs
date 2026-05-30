// Desktop shell helpers for resolving the workspace, launching the web control panel, and building its URL.
use std::{
  env,
  net::{SocketAddr, TcpStream},
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::Mutex,
  thread,
  time::{Duration, Instant},
};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub const DEFAULT_CONTROL_PANEL_PORT: u16 = 4280;

#[derive(Debug, PartialEq, Eq)]
pub struct ControlPanelLaunchConfig {
  pub command: String,
  pub args: Vec<String>,
  pub cwd: PathBuf,
  pub port: u16,
}

pub struct ControlPanelProcess {
  child: Mutex<Option<Child>>,
}

impl ControlPanelProcess {
  fn already_running() -> Self {
    Self {
      child: Mutex::new(None),
    }
  }

  fn spawned(child: Child) -> Self {
    Self {
      child: Mutex::new(Some(child)),
    }
  }
}

impl Drop for ControlPanelProcess {
  fn drop(&mut self) {
    if let Ok(mut child_slot) = self.child.lock() {
      if let Some(mut child) = child_slot.take() {
        let _ = child.kill();
        let _ = child.wait();
      }
    }
  }
}

pub fn run() {
  let workspace_root = workspace_root_from_manifest_dir(Path::new(env!("CARGO_MANIFEST_DIR")))
    .expect("failed to resolve SkillGov workspace root");
  let port = control_panel_port();

  tauri::Builder::default()
    .setup(move |app| {
      let control_panel = start_control_panel(&workspace_root, port)
        .map_err(std::io::Error::other)?;
      app.manage(control_panel);
      create_main_window(app, port)?;
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

pub fn control_panel_url(port: u16) -> String {
  format!("http://127.0.0.1:{port}/?discover=1")
}

pub fn control_panel_port() -> u16 {
  let env_value = env::var("SKILLGOV_DESKTOP_PORT").ok();
  control_panel_port_from_env(env_value.as_deref())
}

pub fn control_panel_port_from_env(value: Option<&str>) -> u16 {
  value
    .and_then(|raw| raw.parse::<u16>().ok())
    .unwrap_or(DEFAULT_CONTROL_PANEL_PORT)
}

pub fn control_panel_launch_config(workspace_root: &Path, port: u16) -> ControlPanelLaunchConfig {
  ControlPanelLaunchConfig {
    command: corepack_command_name().to_string(),
    args: vec![
      "pnpm".to_string(),
      "--filter".to_string(),
      "@skillgov/control-panel".to_string(),
      "dev".to_string(),
    ],
    cwd: workspace_root.to_path_buf(),
    port,
  }
}

pub fn start_control_panel(
  workspace_root: &Path,
  port: u16,
) -> Result<ControlPanelProcess, String> {
  if wait_for_control_panel(port, Duration::from_millis(300)) {
    return Ok(ControlPanelProcess::already_running());
  }

  let launch = control_panel_launch_config(workspace_root, port);
  let mut child = Command::new(&launch.command)
    .args(&launch.args)
    .current_dir(&launch.cwd)
    .env("PORT", launch.port.to_string())
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|err| format!("Failed to start control panel: {err}"))?;

  if wait_for_control_panel(port, Duration::from_secs(30)) {
    Ok(ControlPanelProcess::spawned(child))
  } else {
    let _ = child.kill();
    let _ = child.wait();
    Err(format!("Control panel did not become ready on port {port}"))
  }
}

fn create_main_window(app: &mut tauri::App, port: u16) -> tauri::Result<()> {
  let url = control_panel_url(port)
    .parse()
    .expect("generated control panel URL should be valid");

  WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
    .title("SkillGov")
    .inner_size(1365.0, 900.0)
    .min_inner_size(960.0, 640.0)
    .resizable(true)
    .center()
    .build()?;

  Ok(())
}

fn wait_for_control_panel(port: u16, timeout: Duration) -> bool {
  let deadline = Instant::now() + timeout;
  while Instant::now() <= deadline {
    if is_local_port_open(port) {
      return true;
    }
    thread::sleep(Duration::from_millis(200));
  }
  false
}

fn is_local_port_open(port: u16) -> bool {
  let address = SocketAddr::from(([127, 0, 0, 1], port));
  TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_ok()
}

fn corepack_command_name() -> &'static str {
  if cfg!(windows) {
    "corepack.cmd"
  } else {
    "corepack"
  }
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

  #[test]
  fn builds_discover_url_for_control_panel() {
    assert_eq!(control_panel_url(4280), "http://127.0.0.1:4280/?discover=1");
  }

  #[test]
  fn builds_pnpm_launch_config_for_control_panel() {
    let root = Path::new("D:/SkillGov");
    let config = control_panel_launch_config(root, 4280);

    #[cfg(windows)]
    assert_eq!(config.command, "corepack.cmd");
    #[cfg(not(windows))]
    assert_eq!(config.command, "corepack");

    assert_eq!(
      config.args,
      vec!["pnpm", "--filter", "@skillgov/control-panel", "dev"]
    );
    assert_eq!(config.cwd, root);
    assert_eq!(config.port, 4280);
  }

  #[test]
  fn parses_desktop_port_with_default_fallback() {
    assert_eq!(control_panel_port_from_env(Some("4290")), 4290);
    assert_eq!(control_panel_port_from_env(Some("not-a-port")), DEFAULT_CONTROL_PANEL_PORT);
    assert_eq!(control_panel_port_from_env(None), DEFAULT_CONTROL_PANEL_PORT);
  }
}

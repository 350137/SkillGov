// Desktop shell helpers for resolving the workspace, launching the web control panel, and building its URL.
use std::{
  env,
  fs::{create_dir_all, OpenOptions},
  io::{BufRead, BufReader, Read, Write},
  net::{SocketAddr, TcpStream},
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::Mutex,
  thread,
  time::{Duration, Instant},
};

use serde_json::Value as JsonValue;
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

fn kill_child(child: &mut Child) {
  let _ = child.kill();
  let _ = child.wait();
}

pub fn start_control_panel(
  workspace_root: &Path,
  port: u16,
) -> Result<ControlPanelProcess, String> {
  if wait_for_control_panel(port, Duration::from_millis(300)) {
    verify_control_panel_identity(port)?;
    return Ok(ControlPanelProcess::already_running());
  }

  let log_path = workspace_root.join("logs").join("desktop-control-panel.log");
  if let Some(parent) = log_path.parent() {
    let _ = create_dir_all(parent);
  }
  let log_file = OpenOptions::new()
    .create(true)
    .append(true)
    .open(&log_path)
    .map_err(|err| format!("Failed to open log file {}: {err}", log_path.display()))?;
  let log_stderr = log_file
    .try_clone()
    .map_err(|err| format!("Failed to clone log file handle: {err}"))?;

  let launch = control_panel_launch_config(workspace_root, port);
  let mut child = Command::new(&launch.command)
    .args(&launch.args)
    .current_dir(&launch.cwd)
    .env("PORT", launch.port.to_string())
    .stdin(Stdio::null())
    .stdout(Stdio::from(log_file))
    .stderr(Stdio::from(log_stderr))
    .spawn()
    .map_err(|err| format!("Failed to start control panel: {err}"))?;

  if wait_for_control_panel(port, Duration::from_secs(30)) {
    if let Err(err) = verify_control_panel_identity(port) {
      kill_child(&mut child);
      return Err(format!("{err} Check log: {}", log_path.display()));
    }
    Ok(ControlPanelProcess::spawned(child))
  } else {
    kill_child(&mut child);
    Err(format!(
      "Control panel did not become ready on port {port}. Check log: {}",
      log_path.display()
    ))
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

/// Verify that the service on the given port is actually the SkillGov control panel
/// by requesting /api/status and checking the JSON response has `"app": "SkillGov"`.
fn verify_control_panel_identity(port: u16) -> Result<(), String> {
  let address = SocketAddr::from(([127, 0, 0, 1], port));
  let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(3))
    .map_err(|err| format!("Health check connection failed: {err}"))?;

  stream
    .set_read_timeout(Some(Duration::from_secs(5)))
    .map_err(|err| format!("Failed to set read timeout: {err}"))?;

  let request = format!(
    "GET /api/status HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
  );
  stream
    .write_all(request.as_bytes())
    .map_err(|err| format!("Health check write failed: {err}"))?;

  let mut response = String::new();
  let mut reader = BufReader::new(&stream);
  let _ = reader.read_line(&mut response);
  // Read remaining lines to get the body
  let mut body = String::new();
  let mut headers_done = false;
  for line in reader.by_ref().lines() {
    let line = match line {
      Ok(l) => l,
      Err(_) => break,
    };
    if !headers_done {
      if line.is_empty() {
        headers_done = true;
      }
      continue;
    }
    body.push_str(&line);
  }

  if !response.contains("200") {
    return Err(format!(
      "Health check failed: port {port} returned status line: {response}"
    ));
  }

  let parsed: JsonValue =
    serde_json::from_str(&body).map_err(|err| format!("Health check JSON parse failed: {err}"))?;

  match parsed.get("app").and_then(JsonValue::as_str) {
    Some("SkillGov") => Ok(()),
    other => Err(format!(
      "Health check failed: port {port} is not a SkillGov control panel (app field: {other:?})."
    )),
  }
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

  // --- Health check tests ---

  use std::io::Write;
  use std::net::TcpListener;

  /// Start a TCP listener on a random port, spawn a thread that accepts one
  /// connection, reads the request, then writes the given response. Returns
  /// the port number.
  fn serve_mock_response(http_response: &[u8]) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let http_response = http_response.to_vec();
    std::thread::spawn(move || {
      if let Ok((mut stream, _)) = listener.accept() {
        // Read the request so the client can proceed to read the response
        let _ = stream.read(&mut [0u8; 1024]);
        let _ = stream.write_all(&http_response);
        let _ = stream.flush();
      }
    });
    // Give the listener thread a moment to start accepting
    std::thread::sleep(Duration::from_millis(50));
    port
  }

  #[test]
  fn health_check_passes_for_skillgov_identity() {
    let body = r#"{"app":"SkillGov","apiVersion":"0.1.0","projectRoot":"D:/SkillGov"}"#;
    let response = format!(
      "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
      body.len(),
      body,
    );
    let port = serve_mock_response(response.as_bytes());
    assert!(verify_control_panel_identity(port).is_ok());
  }

  #[test]
  fn health_check_fails_for_non_skillgov_service() {
    let body = r#"{"status":"ok","server":"nginx"}"#;
    let response = format!(
      "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
      body.len(),
      body,
    );
    let port = serve_mock_response(response.as_bytes());
    let err = verify_control_panel_identity(port).unwrap_err();
    assert!(err.contains("not a SkillGov control panel"));
  }

  #[test]
  fn health_check_fails_for_404() {
    let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    let port = serve_mock_response(response.as_bytes());
    let err = verify_control_panel_identity(port).unwrap_err();
    assert!(err.contains("Health check failed"));
  }

  #[test]
  fn health_check_fails_for_connection_refused() {
    // Bind to port 0 to get an unused port, then drop the listener so nothing is listening.
    let port = TcpListener::bind("127.0.0.1:0")
      .unwrap()
      .local_addr()
      .unwrap()
      .port();
    let err = verify_control_panel_identity(port).unwrap_err();
    assert!(err.contains("Health check connection failed"));
  }
}

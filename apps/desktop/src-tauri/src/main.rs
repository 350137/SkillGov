// Entry point for the SkillGov desktop shell — embedded SPA with native Tauri commands.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod commands;
mod desktop;

fn main() {
  desktop::run();
}

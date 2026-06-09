// Entry point for the SkillGov desktop shell — embedded SPA with native Tauri commands.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod desktop;

fn main() {
  desktop::run();
}

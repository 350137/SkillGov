// Entry point for the SkillGov desktop shell that hosts the existing local control panel UI.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;

fn main() {
  desktop::run();
}

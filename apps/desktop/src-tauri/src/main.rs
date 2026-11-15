// Desktop entry; mobile shells call `yonder_desktop_lib::run()` from the generated project.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    yonder_desktop_lib::run()
}

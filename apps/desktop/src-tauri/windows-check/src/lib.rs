//! Compile-only harness: points at the real sources so `cargo check --target x86_64-pc-windows-msvc`
//! proves the Windows backend compiles. Nothing here runs; the `mod`s are the whole crate.
#[path = "../../src/desktop.rs"]
pub mod desktop;
#[path = "../../src/desktop_time.rs"]
pub mod desktop_time;
#[cfg(windows)]
#[path = "../../src/desktop_windows.rs"]
pub mod desktop_windows;

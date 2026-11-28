//! The connector tools version this device reports, in one place.
//!
//! Every local-files / computer-control entry in `connector.ready` carries it, and the server reads
//! it to decide which arguments it may send (`yonder/packages/platform/connectors/src/versions.ts`).
//! Bump it when any operation's arguments or results change shape; the number is shared with the
//! server repository and must change on both sides in the same release.
//!
//! | version | adds                                                                    |
//! | ------- | ----------------------------------------------------------------------- |
//! | 1       | list, read, create, edit, delete, restore                                |
//! | 2       | paged reads, in-place edits, grep, includeIgnored/includeHidden          |
//! | 3       | command-bound original upload from Apple Photos or local files           |
//! | 4       | command-bound file and directory preview (`asset_original`, `file_preview`) |
//! | 5, 7   | the read tools' upgrade: byte-range reads, binary_file, grep offsets; this build reports 7 because the terminal took 6 first |
//! | 6       | the terminal: `shell`, `shell_job`, `capabilities.terminal`              |
//! | 8       | administrator execution: `computer_shell`'s `elevated`, `justification`  |
//! | 9       | desktop control: `desktop_windows`, `desktop_ax`, `desktop_shot`, `desktop_input`, `capabilities.desktop` |

pub const TOOLS_VERSION: u64 = 9;

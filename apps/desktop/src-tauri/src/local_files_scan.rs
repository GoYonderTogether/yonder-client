//! Walking a folder grant for `search`, `index` and `grep`.
//!
//! One walker for all three so the rules that matter — ignore files, hidden entries, links, the
//! recycle folder, the budgets, cancellation — are written once and cannot drift apart:
//!
//! * Discovery is breadth-first, so a result limit is spent on the shallowest matches and the
//!   answer no longer depends on traversal order. Results are sorted by path at the end.
//! * `.gitignore` / `.ignore` are filters, not permissions. `includeIgnored` and `includeHidden`
//!   only widen discovery; the grant still decides what may be opened, and every file is opened
//!   with `O_NOFOLLOW` by [`crate::local_files_text::open_regular`].
//! * Links and Windows junctions are never followed and never reported as directories, and
//!   `.yonder-trash` (the delete recovery folder) is never discovered: a deleted file must not come
//!   back through a search.
//! * Every walk ends for one of three stated reasons: the result cap (`results`), a budget
//!   (`budget`), or an error (cancel, expiry, permission).

use crate::local_files_limits::{
    SCAN_DEADLINE_MS, SCAN_QUEUE, SCAN_RECEIPT_MARGIN_MS, SCAN_VISITS,
};
use crate::local_files_text::{check, link_like, now_ms};
use std::collections::VecDeque;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;

/// The recovery folder `delete` moves files into; never a search result.
pub const TRASH: &str = ".yonder-trash";

/// Why a walk stopped short of visiting everything.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum StopReason {
    /// The result cap was reached.
    Results,
    /// A time, visit or queue budget ran out.
    Budget,
}

impl StopReason {
    pub fn as_str(self) -> &'static str {
        match self {
            StopReason::Results => "results",
            StopReason::Budget => "budget",
        }
    }
}

/// What a file name may match: a case-insensitive name substring, a path glob, or both.
pub struct NameFilter {
    needle: Option<String>,
    glob: Option<ignore::gitignore::Gitignore>,
    root: PathBuf,
}

impl NameFilter {
    /// No name condition: every discovered file is kept.
    pub fn none(root: &Path) -> NameFilter {
        NameFilter {
            needle: None,
            glob: None,
            root: root.to_path_buf(),
        }
    }

    /// A case-insensitive substring of the entry name.
    pub fn needle(root: &Path, needle: &str) -> NameFilter {
        NameFilter {
            needle: Some(needle.to_lowercase()),
            glob: None,
            root: root.to_path_buf(),
        }
    }

    /// A path glob as the caller wrote it, matched from the walk root. Its syntax is gitignore's,
    /// so `*.ts` and `**/*.test.ts` both work.
    pub fn glob(root: &Path, pattern: &str) -> Result<NameFilter, &'static str> {
        if pattern.is_empty() || pattern.len() > 1024 || pattern.contains('\0') {
            return Err("invalid_pattern");
        }
        let mut builder = ignore::gitignore::GitignoreBuilder::new(root);
        builder
            .add_line(None, pattern)
            .map_err(|_| "invalid_pattern")?;
        Ok(NameFilter {
            needle: None,
            glob: Some(builder.build().map_err(|_| "invalid_pattern")?),
            root: root.to_path_buf(),
        })
    }

    /// Both conditions, when the caller gave both (`search` with a query and a glob).
    pub fn both(query: &str, glob: Option<&str>, root: &Path) -> Result<NameFilter, &'static str> {
        let mut filter = NameFilter::needle(root, query);
        if let Some(pattern) = glob {
            if pattern.is_empty() || pattern.len() > 1024 || pattern.contains('\0') {
                return Err("invalid_pattern");
            }
            let mut builder = ignore::gitignore::GitignoreBuilder::new(root);
            builder
                .add_line(None, pattern)
                .map_err(|_| "invalid_pattern")?;
            filter.glob = Some(builder.build().map_err(|_| "invalid_pattern")?);
        }
        Ok(filter)
    }

    fn glob_matches(&self, path: &Path, is_dir: bool) -> bool {
        match &self.glob {
            Some(glob) => {
                let relative = path.strip_prefix(&self.root).unwrap_or(path);
                let matched_path = if relative.as_os_str().is_empty() {
                    path.file_name().map(Path::new).unwrap_or(relative)
                } else {
                    relative
                };
                glob.matched(matched_path, is_dir).is_ignore()
            }
            None => true,
        }
    }

    /// A file is kept when both conditions accept it.
    pub fn keeps_file(&self, path: &Path) -> bool {
        if let Some(needle) = &self.needle {
            let name = path
                .file_name()
                .map(|value| value.to_string_lossy().to_lowercase())
                .unwrap_or_default();
            if !name.contains(needle.as_str()) {
                return false;
            }
        }
        self.glob_matches(path, false)
    }

    /// A directory is listed when the name condition accepts it. The glob only narrows files, so a
    /// directory that does not match `**/*.ts` is still walked for the files inside it.
    pub fn keeps_directory(&self, path: &Path) -> bool {
        let name_matches = match &self.needle {
            Some(needle) => path
                .file_name()
                .map(|value| {
                    value
                        .to_string_lossy()
                        .to_lowercase()
                        .contains(needle.as_str())
                })
                .unwrap_or(false),
            None => false,
        };
        name_matches && self.glob_matches(path, true)
    }
}

pub struct Options {
    /// Follow `.gitignore` / `.ignore` files.
    pub ignored_rules: bool,
    /// Descend into and report hidden entries.
    pub hidden: bool,
}

pub struct Entry {
    pub path: PathBuf,
    pub is_dir: bool,
}

pub struct Walk {
    pub entries: Vec<Entry>,
    pub stop: Option<StopReason>,
    pub root: File,
}

#[path = "local_files_scan_io.rs"]
pub(crate) mod scan_io;
pub use scan_io::open_candidate;
use scan_io::{open_root, Directory};

/// The wall-clock deadline of one scan: the earlier of the scan allowance and the command's own
/// expiry minus a receipt margin, so a slow scan still gets its answer sent back in time.
pub struct Budget {
    deadline: u64,
    visits: u64,
    ignore_bytes: usize,
}

impl Budget {
    pub fn new(expires: u64) -> Budget {
        Budget {
            deadline: now_ms()
                .saturating_add(SCAN_DEADLINE_MS)
                .min(expires.saturating_sub(SCAN_RECEIPT_MARGIN_MS)),
            visits: SCAN_VISITS,
            ignore_bytes: 1024 * 1024,
        }
    }

    pub fn expired(&self) -> bool {
        now_ms() >= self.deadline
    }

    /// One visited entry: false once the visit budget or the deadline is spent.
    pub fn spend(&mut self) -> bool {
        if self.visits == 0 || self.expired() {
            return false;
        }
        self.visits -= 1;
        true
    }
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.') && name != "." && name != ".."
}

/// Walk `root` breadth-first and return the entries the filter accepts, up to `limit`.
///
/// `root` may be a file: then the walk is that one entry, subject to the same filter. A symlink is
/// refused either way, because following it could leave the grant.
pub fn walk(
    anchor: &Path,
    root: &Path,
    filter: &NameFilter,
    options: &Options,
    limit: usize,
    cancelled: &AtomicBool,
    budget: &mut Budget,
) -> Result<Walk, &'static str> {
    if root.components().any(|part| part.as_os_str() == TRASH) {
        return Err("permission_denied");
    }
    let anchor_file = open_root(anchor)?;
    let root_file = open_candidate(&anchor_file, anchor, root)?;
    let root_meta = root_file.metadata().map_err(|_| "operation_failed")?;
    if link_like(&root_meta) {
        return Err("unsupported_file");
    }
    if !root_meta.is_dir() {
        if !root_meta.is_file() {
            return Err("unsupported_file");
        }
        let kept = filter.keeps_file(root);
        return Ok(Walk {
            entries: if kept {
                vec![Entry {
                    path: root.to_path_buf(),
                    is_dir: false,
                }]
            } else {
                Vec::new()
            },
            stop: None,
            root: root_file,
        });
    }
    let mut entries = Vec::new();
    let mut queue: VecDeque<(PathBuf, ignore_chain::Chain)> = VecDeque::new();
    let mut root_chain = None;
    if options.ignored_rules {
        let mut current = anchor.to_path_buf();
        let mut directory = anchor_file;
        let relative = root.strip_prefix(anchor).map_err(|_| "path_invalid")?;
        let mut components = relative.components().peekable();
        loop {
            match ignore_chain::load(root_chain, &current, &directory, cancelled, budget) {
                Ok(chain) => root_chain = chain,
                Err("scan_budget") => {
                    return Ok(Walk {
                        entries,
                        stop: Some(StopReason::Budget),
                        root: root_file,
                    })
                }
                Err(error) => return Err(error),
            }
            let Some(component) = components.next() else {
                break;
            };
            current.push(component.as_os_str());
            if root_chain
                .as_ref()
                .is_some_and(|chain| chain.matched(&current, true).is_ignore())
            {
                return Ok(Walk {
                    entries,
                    stop: None,
                    root: root_file,
                });
            }
            directory = open_candidate(
                &directory,
                current.parent().ok_or("path_invalid")?,
                &current,
            )?;
        }
    }
    queue.push_back((root.to_path_buf(), root_chain));
    let mut stop = None;
    while let Some((dir, chain)) = queue.pop_front() {
        check(cancelled, u64::MAX)?;
        if budget.expired() {
            stop = Some(StopReason::Budget);
            break;
        }
        let dir_file = match open_candidate(&root_file, root, &dir) {
            Ok(file) if file.metadata().map(|m| m.is_dir()).unwrap_or(false) => file,
            _ if dir == root => return Err("permission_denied"),
            _ => continue,
        };
        let mut listing = match Directory::new(&dir_file) {
            Ok(listing) => listing,
            // The root itself must be listable; an unreadable subdirectory is skipped and the rest
            // of the tree is still useful.
            Err(_) if dir == root => return Err("permission_denied"),
            Err(_) => continue,
        };
        let mut directories = Vec::new();
        let mut files = Vec::new();
        let mut spent = false;
        while let Some(name) = listing.next() {
            check(cancelled, u64::MAX)?;
            if queue.len() + entries.len() + directories.len() + files.len() >= SCAN_QUEUE {
                spent = true;
                break;
            }
            if !budget.spend() {
                spent = true;
                break;
            }
            let path = dir.join(&name);
            let shown_name = name.to_string_lossy();
            if shown_name == TRASH || (is_hidden(&shown_name) && !options.hidden) {
                continue;
            }
            let Ok(candidate) = open_candidate(&root_file, root, &path) else {
                continue;
            };
            let Ok(meta) = candidate.metadata() else {
                continue;
            };
            if link_like(&meta) {
                continue;
            }
            let is_dir = meta.is_dir();
            if let Some(chain) = &chain {
                if chain.matched(&path, is_dir).is_ignore() {
                    continue;
                }
            }
            if is_dir {
                directories.push(path);
            } else if meta.is_file() {
                files.push(path);
            }
        }
        for path in files {
            if !filter.keeps_file(&path) {
                continue;
            }
            if entries.len() >= limit {
                stop = Some(StopReason::Results);
                break;
            }
            entries.push(Entry {
                path,
                is_dir: false,
            });
        }
        if stop.is_none() {
            for path in &directories {
                if !filter.keeps_directory(path) {
                    continue;
                }
                if entries.len() >= limit {
                    stop = Some(StopReason::Results);
                    break;
                }
                entries.push(Entry {
                    path: path.clone(),
                    is_dir: true,
                });
            }
        }
        if stop.is_some() {
            break;
        }
        if spent {
            stop = Some(StopReason::Budget);
            break;
        }
        let mut full = false;
        for path in directories {
            if queue.len() >= SCAN_QUEUE {
                full = true;
                break;
            }
            let next = if options.ignored_rules {
                match open_candidate(&root_file, root, &path) {
                    Ok(file) => {
                        match ignore_chain::load(chain.clone(), &path, &file, cancelled, budget) {
                            Ok(next) => next,
                            Err("scan_budget") => {
                                full = true;
                                break;
                            }
                            Err(error) => return Err(error),
                        }
                    }
                    Err(_) => continue,
                }
            } else {
                None
            };
            queue.push_back((path, next));
        }
        if full {
            stop = Some(StopReason::Budget);
            break;
        }
    }
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(Walk {
        entries,
        stop,
        root: root_file,
    })
}

#[path = "local_files_scan_ignore.rs"]
mod ignore_chain;

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    #[test]
    fn candidate_open_rejects_replaced_ancestor_and_trash() {
        let base = std::env::temp_dir().join(format!(
            "yonder-scan-{}-{}",
            std::process::id(),
            crate::local_files_text::now_ms()
        ));
        let root = base.join("root");
        let outside = base.join("outside");
        std::fs::create_dir_all(root.join("dir")).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret"), "secret").unwrap();
        let root = root.canonicalize().unwrap();
        let handle = open_root(&root).unwrap();
        std::fs::rename(root.join("dir"), root.join("old")).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("dir")).unwrap();
        assert!(open_candidate(&handle, &root, &root.join("dir/secret")).is_err());
        let mut budget = Budget::new(u64::MAX);
        assert!(walk(
            &root,
            &root.join("dir"),
            &NameFilter::none(&root),
            &Options {
                ignored_rules: false,
                hidden: true
            },
            200,
            &AtomicBool::new(false),
            &mut budget,
        )
        .is_err());
        std::fs::create_dir_all(root.join(".yonder-trash")).unwrap();
        let mut budget = Budget::new(u64::MAX);
        assert!(walk(
            &root,
            &root.join(".yonder-trash"),
            &NameFilter::none(&root),
            &Options {
                ignored_rules: false,
                hidden: true
            },
            200,
            &AtomicBool::new(false),
            &mut budget
        )
        .is_err());
        std::fs::remove_dir_all(base).unwrap();
    }
}

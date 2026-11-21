use ignore::gitignore::{Gitignore, GitignoreBuilder, Glob};
use ignore::Match;
use std::path::Path;
use std::sync::Arc;

pub struct Node {
    matcher: Gitignore,
    parent: Option<Arc<Node>>,
}

pub type Chain = Option<Arc<Node>>;

/// The chain for `dir`, extending `parent`. A directory without ignore files keeps the parent
/// chain unchanged, so its children cost nothing.
pub fn load(
    parent: Chain,
    dir: &Path,
    directory: &std::fs::File,
    cancelled: &std::sync::atomic::AtomicBool,
    budget: &mut super::Budget,
) -> Result<Chain, &'static str> {
    use std::io::Read;
    let mut builder = GitignoreBuilder::new(dir);
    let mut found = false;
    for name in [".gitignore", ".ignore"] {
        let Ok(mut file) = super::open_candidate(directory, dir, &dir.join(name)) else {
            continue;
        };
        if !file.metadata().map(|m| m.is_file()).unwrap_or(false) {
            continue;
        }
        let mut bytes = Vec::new();
        let mut chunk = [0u8; 8192];
        loop {
            super::check(cancelled, u64::MAX)?;
            if budget.expired() {
                return Err("scan_budget");
            }
            let amount = chunk.len().min(budget.ignore_bytes.saturating_add(1));
            let count = file
                .read(&mut chunk[..amount])
                .map_err(|_| "operation_failed")?;
            if count == 0 {
                break;
            }
            if count > budget.ignore_bytes {
                return Err("scan_budget");
            }
            budget.ignore_bytes -= count;
            bytes.extend_from_slice(&chunk[..count]);
        }
        for line in String::from_utf8_lossy(&bytes).lines() {
            super::check(cancelled, u64::MAX)?;
            if budget.expired() {
                return Err("scan_budget");
            }
            let _ = builder.add_line(Some(dir.join(name)), line);
        }
        found = true;
    }
    if !found {
        return Ok(parent);
    }
    match builder.build() {
        Ok(matcher) => Ok(Some(Arc::new(Node { matcher, parent }))),
        // An unparsable ignore file is a soft failure, as in git: the chain below it must keep
        // working.
        Err(_) => Ok(parent),
    }
}

impl Node {
    /// The innermost matching rule wins, as in git: a deeper file overrides a shallower one.
    pub fn matched(&self, path: &Path, is_dir: bool) -> Match<&Glob> {
        match self.matcher.matched(path, is_dir) {
            Match::None => match &self.parent {
                Some(parent) => parent.matched(path, is_dir),
                None => Match::None,
            },
            found => found,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::{walk, Budget, NameFilter, Options, StopReason};
    use std::sync::atomic::AtomicBool;

    #[test]
    fn inherited_ignore_respects_budget_and_cancellation() {
        let root = std::env::temp_dir().join(format!(
            "yonder-ignore-{}-{}",
            std::process::id(),
            crate::local_files_text::now_ms()
        ));
        std::fs::create_dir_all(root.join("nested")).unwrap();
        let root = root.canonicalize().unwrap();
        std::fs::write(root.join(".gitignore"), "*.secret\n").unwrap();
        std::fs::write(root.join("nested/a.secret"), "secret").unwrap();
        std::fs::write(root.join("nested/visible.rs"), "visible").unwrap();
        let nested = root.join("nested");
        let filter = NameFilter::none(&nested);
        let options = Options {
            ignored_rules: true,
            hidden: false,
        };
        let cancelled = AtomicBool::new(false);
        let result = walk(
            &root,
            &nested,
            &filter,
            &options,
            200,
            &cancelled,
            &mut Budget::new(u64::MAX),
        )
        .unwrap();
        assert_eq!(result.entries.len(), 1);
        assert!(result.entries[0].path.ends_with("visible.rs"));
        let mut budget = Budget::new(u64::MAX);
        budget.ignore_bytes = 1;
        let result = walk(
            &root,
            &nested,
            &filter,
            &options,
            200,
            &cancelled,
            &mut budget,
        )
        .unwrap();
        assert!(matches!(result.stop, Some(StopReason::Budget)));
        cancelled.store(true, std::sync::atomic::Ordering::SeqCst);
        assert!(matches!(
            walk(
                &root,
                &nested,
                &filter,
                &options,
                200,
                &cancelled,
                &mut Budget::new(u64::MAX)
            ),
            Err("cancelled")
        ));
        let glob = NameFilter::both("", Some("*.rs"), &root).unwrap();
        assert!(!glob.keeps_directory(&nested));
        std::fs::remove_dir_all(root).unwrap();
    }
}

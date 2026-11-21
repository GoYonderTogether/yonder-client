use std::fs::File;
use std::path::Path;

// Open each component relative to an already opened directory. No component can be exchanged for
// a symlink between discovery and opening. The root handle remains alive throughout the scan.
#[cfg(unix)]
fn open_at(base: &File, path: &Path) -> Result<File, &'static str> {
    use std::ffi::CString;
    use std::os::fd::{AsRawFd, FromRawFd};
    use std::os::unix::ffi::OsStrExt;
    use std::path::Component;
    let mut current = base.try_clone().map_err(|_| "operation_failed")?;
    for component in path.components() {
        let Component::Normal(name) = component else {
            return Err("path_invalid");
        };
        let name = CString::new(name.as_bytes()).map_err(|_| "path_invalid")?;
        let fd = unsafe {
            libc::openat(
                current.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_NOFOLLOW | libc::O_NONBLOCK | libc::O_CLOEXEC,
            )
        };
        if fd < 0 {
            return Err("permission_denied");
        }
        current = unsafe { File::from_raw_fd(fd) };
    }
    Ok(current)
}

#[cfg(unix)]
pub(crate) fn open_root(root: &Path) -> Result<File, &'static str> {
    let base = File::open("/").map_err(|_| "permission_denied")?;
    let relative = root.strip_prefix("/").map_err(|_| "path_invalid")?;
    open_at(&base, relative)
}

#[cfg(windows)]
fn open_at(base: &File, path: &Path) -> Result<File, &'static str> {
    use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt, OpenOptionsMaybeDirExt};
    use std::path::Component;
    let mut current = base.try_clone().map_err(|_| "operation_failed")?;
    for component in path.components() {
        let Component::Normal(name) = component else {
            return Err("path_invalid");
        };
        let mut options = cap_primitives::fs::OpenOptions::new();
        options
            .read(true)
            .follow(FollowSymlinks::No)
            .maybe_dir(true);
        current = cap_primitives::fs::open(&current, Path::new(name), &options)
            .map_err(|_| "permission_denied")?;
        if crate::local_files_text::link_like(&current.metadata().map_err(|_| "operation_failed")?)
        {
            return Err("permission_denied");
        }
    }
    Ok(current)
}

#[cfg(windows)]
pub(crate) fn open_root(root: &Path) -> Result<File, &'static str> {
    let base_path = root.ancestors().last().ok_or("path_invalid")?;
    if !base_path.has_root() {
        return Err("path_invalid");
    }
    let base = cap_primitives::fs::open_ambient_dir(base_path, cap_fs_ext::ambient_authority())
        .map_err(|_| "permission_denied")?;
    open_at(
        &base,
        root.strip_prefix(base_path).map_err(|_| "path_invalid")?,
    )
}

#[cfg(any(unix, windows))]
pub fn open_candidate(base: &File, root: &Path, path: &Path) -> Result<File, &'static str> {
    let relative = path.strip_prefix(root).map_err(|_| "path_invalid")?;
    open_at(base, relative)
}

#[cfg(not(any(unix, windows)))]
pub(crate) fn open_root(_root: &Path) -> Result<File, &'static str> {
    Err("permission_denied")
}
#[cfg(not(any(unix, windows)))]
pub fn open_candidate(_base: &File, _root: &Path, _path: &Path) -> Result<File, &'static str> {
    Err("permission_denied")
}

#[cfg(unix)]
pub(super) struct Directory(*mut libc::DIR);
#[cfg(unix)]
impl Directory {
    pub(super) fn new(file: &File) -> Result<Self, &'static str> {
        use std::os::fd::AsRawFd;
        let fd = unsafe { libc::dup(file.as_raw_fd()) };
        if fd < 0 {
            return Err("operation_failed");
        }
        let dir = unsafe { libc::fdopendir(fd) };
        if dir.is_null() {
            unsafe {
                libc::close(fd);
            }
            return Err("operation_failed");
        }
        Ok(Self(dir))
    }
    pub(super) fn next(&mut self) -> Option<std::ffi::OsString> {
        use std::os::unix::ffi::OsStringExt;
        loop {
            let entry = unsafe { libc::readdir(self.0) };
            if entry.is_null() {
                return None;
            }
            let name = unsafe { std::ffi::CStr::from_ptr((*entry).d_name.as_ptr()) }.to_bytes();
            if name != b"." && name != b".." {
                return Some(std::ffi::OsString::from_vec(name.to_vec()));
            }
        }
    }
}
#[cfg(unix)]
impl Drop for Directory {
    fn drop(&mut self) {
        unsafe {
            libc::closedir(self.0);
        }
    }
}
#[cfg(windows)]
pub(super) struct Directory(cap_primitives::fs::ReadDir);
#[cfg(windows)]
impl Directory {
    pub(super) fn new(file: &File) -> Result<Self, &'static str> {
        cap_primitives::fs::read_base_dir(file)
            .map(Self)
            .map_err(|_| "permission_denied")
    }
    pub(super) fn next(&mut self) -> Option<std::ffi::OsString> {
        self.0
            .by_ref()
            .flatten()
            .map(|entry| entry.file_name())
            .next()
    }
}
#[cfg(not(any(unix, windows)))]
pub(super) struct Directory;
#[cfg(not(any(unix, windows)))]
impl Directory {
    pub(super) fn new(_: &File) -> Result<Self, &'static str> {
        Err("permission_denied")
    }
    pub(super) fn next(&mut self) -> Option<std::ffi::OsString> {
        None
    }
}

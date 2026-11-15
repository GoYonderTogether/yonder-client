use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::Path;

pub fn private_directory(path: &Path) -> Result<(), String> {
    if !path.exists() {
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                private_directory(parent)?;
            }
        }
        fs::create_dir(path).map_err(|e| e.to_string())?;
        if let Some(parent) = path.parent() {
            sync_directory(parent)?;
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn sync_directory(path: &Path) -> Result<(), String> {
    #[cfg(unix)]
    File::open(path)
        .and_then(|file| file.sync_all())
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension("pending");
    let mut options = OpenOptions::new();
    options.create(true).write(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut file = options.open(&temporary).map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        #[cfg(target_os = "macos")]
        {
            use std::os::fd::AsRawFd;
            unsafe extern "C" {
                fn fcntl(fd: i32, command: i32, ...) -> i32;
            }
            // F_FULLFSYNC also asks the storage device to flush its cache on macOS.
            if unsafe { fcntl(file.as_raw_fd(), 51) } == -1 {
                return Err(std::io::Error::last_os_error().to_string());
            }
        }
        fs::rename(&temporary, path).map_err(|e| e.to_string())?;
        sync_directory(path.parent().ok_or("meeting_invalid_path")?)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub fn encode(samples: &[i16], sample_rate: u32, channels: u16) -> Vec<u8> {
    let length = (samples.len() * 2) as u32;
    let mut bytes = Vec::with_capacity(44 + length as usize);
    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(length + 36).to_le_bytes());
    bytes.extend_from_slice(b"WAVEfmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&channels.to_le_bytes());
    bytes.extend_from_slice(&sample_rate.to_le_bytes());
    bytes.extend_from_slice(&(sample_rate * channels as u32 * 2).to_le_bytes());
    bytes.extend_from_slice(&(channels * 2).to_le_bytes());
    bytes.extend_from_slice(&16u16.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&length.to_le_bytes());
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    bytes
}

pub fn samples(bytes: &[u8], rate: u32, channels: u16) -> Result<usize, String> {
    if channels == 0
        || rate == 0
        || bytes.len() < 44
        || &bytes[..4] != b"RIFF"
        || &bytes[8..16] != b"WAVEfmt "
        || &bytes[36..40] != b"data"
        || u16::from_le_bytes([bytes[20], bytes[21]]) != 1
        || u16::from_le_bytes([bytes[22], bytes[23]]) != channels
        || u32::from_le_bytes(bytes[24..28].try_into().unwrap()) != rate
        || u16::from_le_bytes([bytes[34], bytes[35]]) != 16
        || u32::from_le_bytes(bytes[40..44].try_into().unwrap()) as usize != bytes.len() - 44
        || (bytes.len() - 44) % (channels as usize * 2) != 0
    {
        return Err("meeting_audio_corrupt".into());
    }
    Ok((bytes.len() - 44) / 2)
}

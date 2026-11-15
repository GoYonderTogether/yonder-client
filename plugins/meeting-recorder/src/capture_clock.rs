use std::time::Duration;

/// Unlike std::Instant on macOS, this native clock includes time spent asleep.
#[cfg(target_os = "macos")]
pub fn now() -> Duration {
    #[repr(C)]
    struct Timebase {
        numerator: u32,
        denominator: u32,
    }
    unsafe extern "C" {
        fn mach_continuous_time() -> u64;
        fn mach_timebase_info(info: *mut Timebase) -> i32;
    }
    static RATIO: std::sync::OnceLock<(u32, u32)> = std::sync::OnceLock::new();
    let &(numerator, denominator) = RATIO.get_or_init(|| {
        let mut info = Timebase {
            numerator: 0,
            denominator: 0,
        };
        assert_eq!(unsafe { mach_timebase_info(&mut info) }, 0);
        assert!(info.denominator > 0);
        (info.numerator, info.denominator)
    });
    let nanos = unsafe { mach_continuous_time() } as u128 * numerator as u128 / denominator as u128;
    Duration::from_nanos(nanos as u64)
}

#[cfg(not(target_os = "macos"))]
pub fn now() -> Duration {
    static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    START.get_or_init(std::time::Instant::now).elapsed()
}

#[cfg(test)]
mod tests {
    #[test]
    fn capture_clock_advances_and_gap_math_is_saturating() {
        let before = super::now();
        std::thread::sleep(std::time::Duration::from_millis(2));
        let after = super::now();
        assert!(after > before);
        assert_eq!(before.saturating_sub(after), std::time::Duration::ZERO);
    }
}

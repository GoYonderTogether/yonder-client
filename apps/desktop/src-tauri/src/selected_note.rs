use serde_json::Value;
use std::ffi::{c_char, c_void, CString};

extern "C" {
    fn yonder_notes_status(prompt: bool, launch_existing_grant: bool) -> i32;
    fn yonder_notes_execute(
        list: bool,
        limit: i32,
        offset: i32,
        id: *const c_char,
        context: *mut c_void,
        reply: extern "C" fn(*mut c_void, i32, *const u8, usize),
    );
}

fn status_inner(prompt: bool, launch_existing_grant: bool) -> &'static str {
    match unsafe { yonder_notes_status(prompt, launch_existing_grant) } {
        0 => "granted",
        1 => "undetermined",
        2 => "denied",
        3 => "restricted",
        4 => "unsupported",
        _ => "unavailable",
    }
}

pub(crate) fn status(prompt: bool) -> &'static str {
    status_inner(prompt, false)
}

pub(crate) fn status_for_grant() -> &'static str {
    status_inner(false, true)
}

pub(crate) fn execute(read: bool, args: &Value) -> Result<Value, String> {
    let offset = args.get("offset").and_then(Value::as_u64).unwrap_or(0);
    let (limit, id) = if read {
        let id = args["id"].as_str().ok_or("path_invalid")?;
        (0, id)
    } else {
        let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(20);
        (limit as i32, "")
    };
    let id = CString::new(id).map_err(|_| "path_invalid")?;
    extern "C" fn copy_result(context: *mut c_void, status: i32, data: *const u8, len: usize) {
        let result = match status {
            0 if !data.is_null() && len <= 64_000 => {
                // The synchronous bridge keeps the NSData alive until this callback returns.
                let bytes = unsafe { std::slice::from_raw_parts(data, len) };
                serde_json::from_slice(bytes).map_err(|_| "read_failed".to_owned())
            }
            1 => Err("permission_denied".into()),
            2 => Err("not_found".into()),
            _ => Err("read_failed".into()),
        };
        unsafe { *context.cast::<Result<Value, String>>() = result };
    }

    let mut result: Result<Value, String> = Err("read_failed".into());
    unsafe {
        yonder_notes_execute(
            !read,
            limit,
            offset as i32,
            id.as_ptr(),
            (&mut result as *mut Result<Value, String>).cast(),
            copy_result,
        )
    };
    result
}

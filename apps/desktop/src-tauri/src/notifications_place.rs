use std::ffi::c_void;
use tauri::async_runtime::{channel, Sender};

type Reply = extern "C" fn(*mut c_void, i32);
type LocationReply = extern "C" fn(*mut c_void, i32, f64, f64, f64, i64, bool);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationFix {
    latitude: f64,
    longitude: f64,
    horizontal_accuracy_meters: f64,
    acquired_at_ms: i64,
    approximate: bool,
}

extern "C" {
    fn yonder_ios_prepare_location(context: *mut c_void, reply: Reply);
    fn yonder_ios_current_location(context: *mut c_void, reply: LocationReply);
    fn yonder_ios_prepare_place_reminder(context: *mut c_void, reply: Reply);
    fn yonder_ios_schedule_place_reminder(
        latitude: f64,
        longitude: f64,
        chinese: bool,
        context: *mut c_void,
        reply: Reply,
    );
    fn yonder_ios_place_reminder_pending(context: *mut c_void, reply: Reply);
    fn yonder_ios_cancel_place_reminder(context: *mut c_void, reply: Reply);
}

extern "C" fn receive(context: *mut c_void, code: i32) {
    let sender = unsafe { Box::from_raw(context.cast::<Sender<i32>>()) };
    let _ = sender.try_send(code);
}

async fn invoke(call: impl FnOnce(*mut c_void, Reply)) -> i32 {
    let (sender, mut response) = channel(1);
    call(Box::into_raw(Box::new(sender)).cast(), receive);
    response.recv().await.unwrap_or(5)
}

fn outcome(code: i32) -> Result<(), &'static str> {
    match code {
        0 => Ok(()),
        1 => Err("location_permission_required"),
        2 => Err("notification_permission_required"),
        3 => Err("invalid_place"),
        4 => Err("interrupted"),
        _ => Err("place_reminder_unavailable"),
    }
}

pub async fn prepare() -> Result<(), &'static str> {
    outcome(invoke(|context, reply| unsafe { yonder_ios_prepare_place_reminder(context, reply) }).await)
}

pub async fn schedule(latitude: f64, longitude: f64, chinese: bool) -> Result<(), &'static str> {
    if !(-90.0..=90.0).contains(&latitude) || !(-180.0..=180.0).contains(&longitude) {
        return Err("invalid_place");
    }
    outcome(
        invoke(|context, reply| unsafe {
            yonder_ios_schedule_place_reminder(latitude, longitude, chinese, context, reply)
        })
        .await,
    )
}

pub async fn pending() -> bool {
    invoke(|context, reply| unsafe { yonder_ios_place_reminder_pending(context, reply) }).await == 1
}

pub async fn cancel() {
    let _ = invoke(|context, reply| unsafe { yonder_ios_cancel_place_reminder(context, reply) }).await;
}

pub async fn prepare_location() -> Result<(), &'static str> {
    match invoke(|context, reply| unsafe { yonder_ios_prepare_location(context, reply) }).await {
        0 => Ok(()),
        1 => Err("location_permission_required"),
        4 => Err("interrupted"),
        _ => Err("location_unavailable"),
    }
}

type LocationResult = Result<LocationFix, &'static str>;

extern "C" fn receive_location(
    context: *mut c_void,
    code: i32,
    latitude: f64,
    longitude: f64,
    horizontal_accuracy_meters: f64,
    acquired_at_ms: i64,
    approximate: bool,
) {
    let sender = unsafe { Box::from_raw(context.cast::<Sender<LocationResult>>()) };
    let result = match code {
        0 => Ok(LocationFix {
            latitude,
            longitude,
            horizontal_accuracy_meters,
            acquired_at_ms,
            approximate,
        }),
        1 => Err("location_permission_required"),
        4 => Err("interrupted"),
        6 => Err("location_timeout"),
        _ => Err("location_unavailable"),
    };
    let _ = sender.try_send(result);
}

pub async fn current_location() -> LocationResult {
    let (sender, mut response) = channel::<LocationResult>(1);
    unsafe { yonder_ios_current_location(Box::into_raw(Box::new(sender)).cast(), receive_location) };
    response.recv().await.unwrap_or(Err("location_unavailable"))
}

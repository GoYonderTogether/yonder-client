use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SizedSample};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use std::time::Duration;

pub struct Capture {
    pub stream: cpal::Stream,
    pub receiver: mpsc::Receiver<(Vec<i16>, Duration)>,
    pub failed: Arc<AtomicBool>,
    pub sample_rate: u32,
    pub channels: u16,
}

fn input<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sender: mpsc::SyncSender<(Vec<i16>, Duration)>,
    failed: Arc<AtomicBool>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    i16: FromSample<T>,
{
    let error = failed.clone();
    device
        .build_input_stream(
            config,
            move |data: &[T], _| {
                if sender
                    .try_send((
                        data.iter()
                            .map(|sample| sample.to_sample::<i16>())
                            .collect(),
                        crate::capture_clock::now(),
                    ))
                    .is_err()
                {
                    failed.store(true, Ordering::Release);
                }
            },
            move |_| {
                error.store(true, Ordering::Release);
            },
            None,
        )
        .map_err(|e| format!("meeting_microphone_unavailable: {e}"))
}

impl Capture {
    pub fn new() -> Result<Self, String> {
        let device = cpal::default_host()
            .default_input_device()
            .ok_or("meeting_microphone_unavailable")?;
        let supported = device.default_input_config().map_err(|e| e.to_string())?;
        let config = supported.config();
        let (sender, receiver) = mpsc::sync_channel(64);
        let failed = Arc::new(AtomicBool::new(false));
        let stream = match supported.sample_format() {
            cpal::SampleFormat::F32 => input::<f32>(&device, &config, sender, failed.clone()),
            cpal::SampleFormat::I16 => input::<i16>(&device, &config, sender, failed.clone()),
            cpal::SampleFormat::U16 => input::<u16>(&device, &config, sender, failed.clone()),
            other => Err(format!("meeting_audio_format_unsupported: {other}")),
        }?;
        Ok(Self {
            stream,
            receiver,
            failed,
            sample_rate: config.sample_rate.0,
            channels: config.channels,
        })
    }

    pub fn play(&self) -> Result<(), String> {
        self.stream
            .play()
            .map_err(|e| format!("meeting_microphone_unavailable: {e}"))
    }
}

package net.yonder.meetingrecorder

import android.content.Context
import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioManager
import android.media.AudioRecordingConfiguration
import android.media.MediaRecorder
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

internal object MeetingRecorderRuntime {
    private val lock = Any()
    private var store: RecordingStore? = null
    private var owner: String? = null
    private var active: JSONObject? = null
    private var audio: AudioRecord? = null
    private var worker: Thread? = null
    private val running = AtomicBoolean(false)
    @Volatile private var pendingBytes = 0
    @Volatile private var audioLevel = 0.0
    @Volatile private var stopReason: String? = null
    @Volatile private var paused = false
    @Volatile private var pausing = false
    var didStop: (() -> Unit)? = null

    private fun storage(context: Context): RecordingStore {
        return store ?: RecordingStore(File(context.filesDir, "meeting-recorder")).also { store = it }
    }

    fun setOwner(context: Context, next: String?): JSONObject {
        if (synchronized(lock) { owner != next }) {
            stop(null)
            synchronized(lock) {
                if (next != null) storage(context).list(next, true)
                owner = next
            }
        }
        return state(context, next)
    }

    fun state(context: Context, requested: String?): JSONObject = synchronized(lock) {
        require(owner == requested) { "wrong_owner" }
        val current = active
        val records = if (requested == null) JSONArray() else storage(context).list(requested, true, current?.getString("id"))
        for (index in 0 until records.length()) {
            val record = records.getJSONObject(index)
            if (record.getString("id") == current?.getString("id")) {
                record.put("durationMs", record.getLong("savedDurationMs") + pendingBytes.toLong() * 1000 / (record.getInt("sampleRate") * 2))
            }
        }
        JSONObject().put("supported", true).put("activeId", current?.getString("id") ?: JSONObject.NULL)
            .put("audioLevel", if (current == null) 0.0 else audioLevel).put("paused", paused).put("pauseSupported", true).put("recordings", records)
    }

    fun read(context: Context, requested: String, id: String, index: Int): ByteArray = synchronized(lock) {
        require(owner == requested) { "wrong_owner" }
        storage(context).read(requested, id, index)
    }

    private fun watchSilencing(context: Context, recorder: AudioRecord) {
        if (Build.VERSION.SDK_INT >= 29) {
            recorder.registerAudioRecordingCallback(context.mainExecutor, object : AudioManager.AudioRecordingCallback() {
                override fun onRecordingConfigChanged(configurations: MutableList<AudioRecordingConfiguration>) {
                    if (running.get() && audio === recorder && configurations.any { it.clientAudioSessionId == recorder.audioSessionId && it.isClientSilenced }) {
                        thread(name = "meeting-audio-interruption") { stop("audio_interrupted") }
                    }
                }
            })
        }
    }

    fun start(context: Context, requested: String, title: String, conversationId: String?, separateSpeakers: Boolean): JSONObject = synchronized(lock) {
        require(owner == requested) { "wrong_owner" }
        check(active == null && worker == null) { "recording_busy" }
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            throw SecurityException("microphone_denied")
        }
        val rate = 16000
        val minimum = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        check(minimum > 0) { "microphone_unavailable" }
        val recorder = AudioRecord(MediaRecorder.AudioSource.MIC, rate, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum * 2, 8192))
        try {
            check(recorder.state == AudioRecord.STATE_INITIALIZED) { "microphone_unavailable" }
            recorder.startRecording()
            check(recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "microphone_unavailable" }
            val record = storage(context).create(requested, title, rate, conversationId, separateSpeakers)
            active = record; audio = recorder; pendingBytes = 0; stopReason = null; running.set(true)
            watchSilencing(context, recorder)
            worker = thread(name = "meeting-audio-writer") { capture(context, recorder, record) }
        } catch (error: Exception) {
            running.set(false)
            active?.let { record ->
                record.put("state", "interrupted").put("endedAt", System.currentTimeMillis()).put("error", "capture_start_failed")
                try { storage(context).save(record) } catch (_: Exception) { }
            }
            active = null; audio = null; worker = null
            recorder.release()
            throw error
        }
        state(context, requested)
    }

    fun stop(reason: String?, requested: String? = null, id: String? = null) {
        val capture = synchronized(lock) {
            if (requested != null) require(owner == requested) { "wrong_owner" }
            if (id != null && active != null) require(active!!.getString("id") == id) { "wrong_recording" }
            if (paused) {
                val record = active
                if (record != null) {
                    record.put("state", if (reason == null) "ended" else "interrupted").put("endedAt", System.currentTimeMillis()).put("error", reason ?: JSONObject.NULL)
                    store!!.save(record)
                }
                active = null; paused = false
                didStop?.invoke()
                return
            }
            stopReason = reason
            running.set(false)
            try { audio?.stop() } catch (_: IllegalStateException) { }
            worker
        }
        if (capture != Thread.currentThread()) capture?.join()
    }

    fun pause(requested: String, id: String) {
        val capture = synchronized(lock) {
            require(owner == requested && active?.optString("id") == id && !paused) { "wrong_recording" }
            pausing = true
            running.set(false)
            try { audio?.stop() } catch (_: IllegalStateException) { }
            worker
        }
        capture?.join()
        check(paused) { "audio_capture_or_storage_failed" }
    }

    /** Continues an interrupted recording into the same record. Nothing is written until the microphone runs. */
    fun resumeInterrupted(context: Context, requested: String, id: String): JSONObject = synchronized(lock) {
        require(owner == requested) { "wrong_owner" }
        check(active == null && worker == null) { "recording_busy" }
        val record = storage(context).resumable(requested, id)
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) throw SecurityException("microphone_denied")
        val rate = record.getInt("sampleRate")
        val minimum = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        check(minimum > 0) { "microphone_unavailable" }
        val recorder = AudioRecord(MediaRecorder.AudioSource.MIC, rate, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum * 2, 8192))
        try {
            check(recorder.state == AudioRecord.STATE_INITIALIZED) { "microphone_unavailable" }
            recorder.startRecording()
            check(recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "microphone_unavailable" }
            record.put("state", "recording").put("endedAt", JSONObject.NULL).put("error", JSONObject.NULL)
            storage(context).save(record)
            active = record; audio = recorder; pendingBytes = 0; stopReason = null; running.set(true)
            watchSilencing(context, recorder)
            worker = thread(name = "meeting-audio-writer") { capture(context, recorder, record) }
        } catch (error: Exception) {
            running.set(false); active = null; audio = null; worker = null
            recorder.release()
            throw error
        }
        state(context, requested)
    }

    /** Ends an interrupted recording that is not being captured. */
    fun concludeInterrupted(context: Context, requested: String, id: String) = synchronized(lock) {
        require(owner == requested) { "wrong_owner" }
        check(active == null) { "recording_busy" }
        storage(context).conclude(requested, id)
    }

    fun resume(context: Context, requested: String, id: String) = synchronized(lock) {
        require(owner == requested && active?.optString("id") == id && paused) { "wrong_recording" }
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) throw SecurityException("microphone_denied")
        val minimum = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        check(minimum > 0) { "microphone_unavailable" }
        val recorder = AudioRecord(MediaRecorder.AudioSource.MIC, 16000, AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT, maxOf(minimum * 2, 8192))
        try {
            check(recorder.state == AudioRecord.STATE_INITIALIZED) { "microphone_unavailable" }
            recorder.startRecording()
            check(recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) { "microphone_unavailable" }
            val record = active!!
            audio = recorder; paused = false; pausing = false; stopReason = null; running.set(true)
            watchSilencing(context, recorder)
            worker = thread(name = "meeting-audio-writer") { capture(context, recorder, record) }
        } catch (error: Exception) { recorder.release(); throw error }
    }

    private fun capture(context: Context, recorder: AudioRecord, record: JSONObject) {
        val pending = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        try {
            while (running.get()) {
                val count = recorder.read(buffer, 0, buffer.size)
                if (!running.get()) break
                check(count > 0 && count % 2 == 0) { "audio_capture_failed" }
                var peak = 0
                for (index in 0 until count step 2) {
                    val sample = (buffer[index + 1].toInt() shl 8) or (buffer[index].toInt() and 255)
                    peak = maxOf(peak, kotlin.math.abs(sample))
                }
                audioLevel = peak / 32768.0
                var offset = 0
                while (offset < count) {
                    val available = minOf(count - offset, 16000 * 2 * 4 - pending.size())
                    pending.write(buffer, offset, available); offset += available; pendingBytes = pending.size()
                    if (pending.size() == 16000 * 2 * 4) {
                        synchronized(lock) { storage(context).append(record, pending.toByteArray()) }
                        pending.reset(); pendingBytes = 0
                    }
                }
            }
            if (pending.size() > 0) synchronized(lock) { storage(context).append(record, pending.toByteArray()) }
        } catch (_: Exception) {
            stopReason = "audio_capture_or_storage_failed"
        } finally {
            running.set(false)
            try { recorder.stop() } catch (_: IllegalStateException) { }
            recorder.release()
            synchronized(lock) {
                if (pausing && stopReason == null) {
                    try { storage(context).save(record); paused = true } catch (_: Exception) { stopReason = "audio_capture_or_storage_failed" }
                }
                if (paused) {
                    audio = null; worker = null; pendingBytes = 0; audioLevel = 0.0; pausing = false
                    return
                }
                record.put("state", if (stopReason == null) "ended" else "interrupted")
                    .put("endedAt", System.currentTimeMillis()).put("error", stopReason ?: JSONObject.NULL)
                try { storage(context).save(record) } catch (_: Exception) { }
                active = null; audio = null; worker = null; pendingBytes = 0; audioLevel = 0.0
                pausing = false
            }
            didStop?.invoke()
        }
    }
}

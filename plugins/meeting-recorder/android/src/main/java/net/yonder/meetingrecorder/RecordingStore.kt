package net.yonder.meetingrecorder

import android.system.Os
import android.system.OsConstants
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

internal class RecordingStore(private val root: File) {
    init {
        check(root.exists() || root.mkdirs())
        syncDirectory(root.parentFile!!)
    }

    private fun directory(owner: String, id: String? = null): File {
        require(owner.matches(Regex("[A-Za-z0-9_-]{1,128}"))) { "invalid_owner" }
        val folder = File(root, owner)
        if (id == null) return folder
        require(UUID.fromString(id).toString() == id) { "invalid_recording" }
        return File(folder, id)
    }

    fun create(owner: String, title: String, rate: Int): JSONObject {
        val id = UUID.randomUUID().toString()
        check(directory(owner, id).mkdirs())
        syncDirectory(root)
        syncDirectory(directory(owner))
        val record = JSONObject().apply {
            put("id", id); put("ownerId", owner); put("title", title.take(200))
            put("state", "recording"); put("startedAt", System.currentTimeMillis())
            put("endedAt", JSONObject.NULL); put("durationMs", 0); put("savedDurationMs", 0)
            put("sampleRate", rate); put("channels", 1); put("segments", JSONArray())
            put("error", JSONObject.NULL)
        }
        save(record)
        return record
    }

    fun save(record: JSONObject) {
        durableWrite(File(directory(record.getString("ownerId"), record.getString("id")), "recording.json"), record.toString().toByteArray())
    }

    fun append(record: JSONObject, pcm: ByteArray) {
        require(pcm.isNotEmpty() && pcm.size % 2 == 0)
        val rate = record.getInt("sampleRate")
        val segments = record.getJSONArray("segments")
        val index = segments.length()
        val audio = wave(pcm, rate)
        durableWrite(File(directory(record.getString("ownerId"), record.getString("id")), "%06d.wav".format(index)), audio)
        val duration = pcm.size.toLong() * 1000 / (rate * 2)
        segments.put(JSONObject().put("index", index).put("durationMs", duration).put("byteLength", audio.size))
        val saved = record.getLong("savedDurationMs") + duration
        record.put("savedDurationMs", saved).put("durationMs", saved)
        save(record)
    }

    fun list(owner: String, recover: Boolean, activeId: String? = null): JSONArray {
        val records = directory(owner).listFiles().orEmpty().filter { it.isDirectory }.mapNotNull { folder ->
            val manifest = File(folder, "recording.json")
            if (!manifest.isFile) return@mapNotNull null
            val record = JSONObject(manifest.readText())
            require(record.getString("ownerId") == owner && record.getString("id") == folder.name)
            if (recover && record.getString("state") == "recording" && record.getString("id") != activeId) {
                val segments = JSONArray()
                var duration = 0L
                var damaged = false
                folder.listFiles().orEmpty().filter { it.name.matches(Regex("[0-9]{6}\\.wav")) }
                    .sortedBy { it.name }.forEach { file ->
                        val bytes = try { file.readBytes() } catch (_: Exception) { damaged = true; return@forEach }
                        if (!validWave(bytes, record.getInt("sampleRate"))) { damaged = true; return@forEach }
                        val length = (bytes.size - 44).toLong() * 1000 / (record.getInt("sampleRate") * 2)
                        segments.put(JSONObject().put("index", file.nameWithoutExtension.toInt()).put("durationMs", length).put("byteLength", bytes.size))
                        duration += length
                    }
                record.put("segments", segments).put("durationMs", duration).put("savedDurationMs", duration)
                    .put("state", "interrupted").put("endedAt", System.currentTimeMillis())
                    .put("error", if (damaged) "audio_segment_damaged" else "recording_interrupted")
                try { save(record) } catch (_: Exception) { record.put("error", "audio_storage_failed") }
            }
            record
        }.sortedByDescending { it.getLong("startedAt") }
        return JSONArray(records)
    }

    fun read(owner: String, id: String, index: Int): ByteArray {
        require(index in 0..999999)
        val folder = directory(owner, id)
        val record = JSONObject(File(folder, "recording.json").readText())
        require(record.getString("ownerId") == owner)
        val audio = File(folder, "%06d.wav".format(index)).readBytes()
        require(validWave(audio, record.getInt("sampleRate"))) { "invalid_audio" }
        return audio
    }

    private fun durableWrite(file: File, bytes: ByteArray) {
        val temporary = File(file.parentFile, "${file.name}.pending")
        FileOutputStream(temporary).use { output -> output.write(bytes); output.fd.sync() }
        Os.chmod(temporary.path, 0x180) // owner read/write (0600)
        Os.rename(temporary.path, file.path)
        syncDirectory(file.parentFile!!)
    }

    private fun syncDirectory(folder: File) {
        val descriptor = Os.open(folder.path, OsConstants.O_RDONLY, 0)
        try { Os.fsync(descriptor) } finally { Os.close(descriptor) }
    }

    companion object {
        private fun validWave(bytes: ByteArray, rate: Int): Boolean {
            if (bytes.size < 44 || bytes.size % 2 != 0) return false
            val data = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            return String(bytes, 0, 4) == "RIFF" && String(bytes, 8, 4) == "WAVE" && String(bytes, 36, 4) == "data" &&
                data.getInt(4) == bytes.size - 8 && data.getInt(24) == rate && data.getInt(40) == bytes.size - 44
        }

        fun wave(pcm: ByteArray, rate: Int): ByteArray {
            return ByteBuffer.allocate(44 + pcm.size).order(ByteOrder.LITTLE_ENDIAN).apply {
                put("RIFF".toByteArray()); putInt(36 + pcm.size); put("WAVEfmt ".toByteArray()); putInt(16)
                putShort(1); putShort(1); putInt(rate); putInt(rate * 2); putShort(2); putShort(16)
                put("data".toByteArray()); putInt(pcm.size); put(pcm)
            }.array()
        }
    }
}

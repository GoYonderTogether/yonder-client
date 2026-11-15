package net.yonder.meetingrecorder

import android.app.Activity
import android.app.Instrumentation
import android.os.Bundle
import java.io.File
import java.util.UUID
import org.json.JSONObject

class RecordingStoreTest : Instrumentation() {
    override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }

    override fun onStart() {
        var passed = 0
        val errors = mutableListOf<String>()
        for (test in listOf(::recoverDurableAudioAfterManifestFailureAndBadTail, ::serviceDoesNotRestartRecordingWithoutExplicitStart)) {
            try { test(); passed++ } catch (error: Throwable) { errors.add(error.toString()) }
        }
        finish(if (passed == 2) Activity.RESULT_OK else Activity.RESULT_CANCELED, Bundle().apply {
            putInt("tests", 2); putInt("passed", passed); putInt("failed", errors.size); putString("errors", errors.joinToString("\n"))
        })
    }

    private fun recoverDurableAudioAfterManifestFailureAndBadTail() {
        val context = targetContext
        val root = File(context.filesDir, "meeting-test-${UUID.randomUUID()}")
        try {
            val store = RecordingStore(root)
            val record = store.create("owner-one", "Storage regression", 16000)
            val pcm = ByteArray(16000 * 2 * 4) { 7 }
            store.append(record, pcm)
            val initializing = File(root, "owner-one/${UUID.randomUUID()}")
            check(initializing.mkdir())
            val initialManifest = File(initializing, "recording.json.pending")
            initialManifest.writeText("unfinished initial manifest")
            val initialized = store.list("owner-one", false)
            check(initialized.length() == 1 && initialized.getJSONObject(0).getString("id") == record.getString("id"))
            check(RecordingStore.wave(pcm, 16000).contentEquals(store.read("owner-one", record.getString("id"), 0)))
            check(initialManifest.isFile) { "unfinished initialization files must be preserved" }
            val folder = File(root, "owner-one/${record.getString("id")}")
            val blocker = File(folder, "recording.json.pending")
            check(blocker.mkdir())
            check(runCatching { store.append(record, pcm) }.isFailure) { "manifest failure was not reported" }
            check(record.getJSONArray("segments").length() == 2)
            val stopped = store.list("owner-one", true).getJSONObject(0)
            check(stopped.getString("state") == "interrupted")
            check(stopped.getString("error") == "audio_storage_failed")
            check(stopped.getInt("savedDurationMs") == 8000)
            check(RecordingStore.wave(pcm, 16000).contentEquals(store.read("owner-one", record.getString("id"), 1)))
            check(blocker.delete())
            File(folder, "000002.wav").writeBytes(RecordingStore.wave(pcm, 16000).dropLast(2).toByteArray())
            val recovered = RecordingStore(root).list("owner-one", true).getJSONObject(0)
            check(recovered.getString("state") == "interrupted")
            check(recovered.getString("error") == "audio_segment_damaged")
            check(recovered.getJSONArray("segments").length() == 2)
            check(recovered.getInt("savedDurationMs") == 8000)
            check(RecordingStore.wave(pcm, 16000).contentEquals(store.read("owner-one", record.getString("id"), 0)))
            check(store.list("owner-two", true).length() == 0)
            check(runCatching { store.list("../escape", true) }.isFailure) { "owner traversal accepted" }
            val next = store.create("owner-one", "New recording", 16000)
            check(record.getString("id") != next.getString("id"))
            check(next.get("endedAt") == JSONObject.NULL)
        } finally { root.deleteRecursively() }
    }

    private fun serviceDoesNotRestartRecordingWithoutExplicitStart() {
        check(MeetingRecorderService.startArguments(null) == null)
        check(MeetingRecorderService.startArguments(android.content.Intent().putExtra("ownerId", "owner-one")) == null)
        check(MeetingRecorderService.startArguments(android.content.Intent().setAction("start")) == null)
        val explicit = android.content.Intent().setAction("start").putExtra("ownerId", "owner-one").putExtra("title", "Meeting")
        check(MeetingRecorderService.startArguments(explicit) == ("owner-one" to "Meeting"))
    }
}

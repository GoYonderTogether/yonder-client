package net.yonder.meetingrecorder

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class MeetingArgs {
    var ownerId: String? = null
    var title: String = ""
    var conversationId: String? = null
    var separateSpeakers: Boolean = false
    var transportMode: String? = null
    var recordingId: String = ""
    var segmentIndex: Int = -1
}

@TauriPlugin(permissions = [
    Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone"),
    Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")
])
class MeetingRecorderPlugin(private val activity: Activity) : Plugin(activity) {
    private fun respond(invoke: Invoke, work: (MeetingArgs) -> JSObject) {
        try { invoke.resolve(work(invoke.parseArgs(MeetingArgs::class.java))) }
        catch (error: Exception) { invoke.reject(error.message ?: "meeting_recorder_failed") }
    }

    @Command
    fun setOwner(invoke: Invoke) = respond(invoke) { args -> JSObject(MeetingRecorderRuntime.setOwner(activity, args.ownerId).toString()) }

    @Command
    fun getState(invoke: Invoke) = respond(invoke) { args -> JSObject(MeetingRecorderRuntime.state(activity, args.ownerId).toString()) }

    @Command
    fun start(invoke: Invoke) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", invoke, "microphoneResult")
            return
        }
        ensureNotificationPermission(invoke)
    }

    @PermissionCallback
    fun microphoneResult(invoke: Invoke) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) invoke.reject("microphone_denied")
        else ensureNotificationPermission(invoke)
    }

    private fun ensureNotificationPermission(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", invoke, "notificationResult")
        } else begin(invoke)
    }

    @PermissionCallback
    fun notificationResult(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            // M1 requires an accessible background control. Declining must not start a hidden recorder.
            invoke.reject("notifications_denied")
        } else begin(invoke)
    }

    private fun begin(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(MeetingArgs::class.java)
            val owner = requireNotNull(args.ownerId) { "invalid_owner" }
            require(!activity.isFinishing) { "activity_unavailable" }
            val notifications = activity.getSystemService(NotificationManager::class.java)
            require(notifications.areNotificationsEnabled()) { "notifications_disabled" }
            if (Build.VERSION.SDK_INT >= 26) {
                require(notifications.getNotificationChannel("meeting-recording")?.importance != NotificationManager.IMPORTANCE_NONE) { "notifications_disabled" }
            }
            val state = MeetingRecorderRuntime.state(activity, owner)
            require(state.isNull("activeId") && MeetingRecorderService.startResult == null) { "recording_busy" }
            MeetingRecorderService.startResult = { result ->
                result.fold({ invoke.resolve(JSObject(MeetingRecorderRuntime.state(activity, owner).toString())) },
                    { error -> invoke.reject(error.message ?: "meeting_recorder_start_failed") })
            }
            val intent = Intent(activity, MeetingRecorderService::class.java).setAction("start")
                .putExtra("ownerId", owner).putExtra("title", args.title).putExtra("conversationId", args.conversationId)
                .putExtra("separateSpeakers", args.separateSpeakers)
                .putExtra("transportMode", args.transportMode)
            if (Build.VERSION.SDK_INT >= 26) activity.startForegroundService(intent) else activity.startService(intent)
        } catch (error: Exception) {
            MeetingRecorderService.startResult = null
            invoke.reject(error.message ?: "meeting_recorder_start_failed")
        }
    }

    @Command
    fun stop(invoke: Invoke) = respond(invoke) { args ->
        val owner = requireNotNull(args.ownerId) { "invalid_owner" }
        if (MeetingRecorderRuntime.state(activity, owner).isNull("activeId")) MeetingRecorderRuntime.concludeInterrupted(activity, owner, args.recordingId)
        else MeetingRecorderRuntime.stop(null, owner, args.recordingId)
        JSObject(MeetingRecorderRuntime.state(activity, owner).toString())
    }

    @Command
    fun pause(invoke: Invoke) = respond(invoke) { args ->
        val owner = requireNotNull(args.ownerId) { "invalid_owner" }
        MeetingRecorderRuntime.pause(owner, args.recordingId)
        JSObject(MeetingRecorderRuntime.state(activity, owner).toString())
    }

    @Command
    fun resume(invoke: Invoke) {
        val args = invoke.parseArgs(MeetingArgs::class.java)
        val owner = args.ownerId
        if (owner == null || !MeetingRecorderRuntime.state(activity, owner).isNull("activeId")) {
            respond(invoke) { a ->
                val o = requireNotNull(a.ownerId) { "invalid_owner" }
                MeetingRecorderRuntime.resume(activity, o, a.recordingId)
                JSObject(MeetingRecorderRuntime.state(activity, o).toString())
            }
            return
        }
        // An interrupted recording is continued like a new start: through the foreground service, so the
        // microphone keeps running when the app goes to the background.
        try {
            if (getPermissionState("microphone") != PermissionState.GRANTED) { invoke.reject("microphone_denied"); return }
            require(MeetingRecorderService.startResult == null) { "recording_busy" }
            MeetingRecorderService.startResult = { result ->
                result.fold({ invoke.resolve(JSObject(MeetingRecorderRuntime.state(activity, owner).toString())) },
                    { error -> invoke.reject(error.message ?: "meeting_recorder_resume_failed") })
            }
            val intent = Intent(activity, MeetingRecorderService::class.java).setAction("resume")
                .putExtra("ownerId", owner).putExtra("recordingId", args.recordingId)
            if (Build.VERSION.SDK_INT >= 26) activity.startForegroundService(intent) else activity.startService(intent)
        } catch (error: Exception) {
            MeetingRecorderService.startResult = null
            invoke.reject(error.message ?: "meeting_recorder_resume_failed")
        }
    }

    @Command
    fun readAudio(invoke: Invoke) = respond(invoke) { args ->
        val owner = requireNotNull(args.ownerId) { "invalid_owner" }
        val audio = MeetingRecorderRuntime.read(activity, owner, args.recordingId, args.segmentIndex)
        JSObject().put("bytes", JSArray.from(audio.map { it.toInt() and 255 }.toTypedArray()))
    }
}

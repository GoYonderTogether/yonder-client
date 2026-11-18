package net.yonder.meetingrecorder

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

class MeetingRecorderService : Service() {
    companion object {
        internal var startResult: ((Result<Unit>) -> Unit)? = null
        private const val CHANNEL = "meeting-recording"
        private const val NOTIFICATION = 7381
        internal fun startArguments(intent: Intent?): Pair<String, String>? {
            if (intent?.action != "start") return null
            val owner = intent.getStringExtra("ownerId") ?: return null
            return owner to (intent.getStringExtra("title") ?: "")
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val notifications = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            notifications.createNotificationChannel(NotificationChannel(CHANNEL, "Recording / 录音", NotificationManager.IMPORTANCE_LOW))
        }
        MeetingRecorderRuntime.didStop = { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "stop") {
            MeetingRecorderRuntime.stop(null)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        // Never restart the microphone after process death or a service restart without a new user start.
        val arguments = startArguments(intent)
        if (arguments == null) { stopSelf(); return START_NOT_STICKY }
        @Suppress("DEPRECATION")
        val builder = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this))
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Meeting recording / 会议录音")
            .setContentText("Audio is saved on this device / 音频保存在本机")
            .setOngoing(true)
        packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
            builder.setContentIntent(PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        }
        val stop = PendingIntent.getService(this, 1, Intent(this, MeetingRecorderService::class.java).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        builder.addAction(Notification.Action.Builder(null, "Stop / 结束", stop).build())
        val callback = startResult
        startResult = null
        try {
            if (Build.VERSION.SDK_INT >= 30) startForeground(NOTIFICATION, builder.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            else startForeground(NOTIFICATION, builder.build())
            MeetingRecorderRuntime.start(this, arguments.first, arguments.second)
            callback?.invoke(Result.success(Unit))
        } catch (error: Exception) {
            callback?.invoke(Result.failure(error))
            stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        MeetingRecorderRuntime.stop("service_stopped")
        MeetingRecorderRuntime.didStop = null
        super.onDestroy()
    }
}

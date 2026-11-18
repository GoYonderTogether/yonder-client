package net.yonderbot.app

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.os.Build
import android.webkit.WebView
import androidx.core.app.NotificationManagerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import java.lang.ref.WeakReference
import java.util.Locale

private const val CHANNEL = "messages"
private val targetKeys = listOf("notificationId", "conversationId", "messageId", "recipientMemberId")

@TauriPlugin(permissions = [
  Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "messages")
])
class YonderNotificationsPlugin(private val host: Activity) : Plugin(host) {
  private val manager get() = host.getSystemService(NotificationManager::class.java)
  private val permissionHistory get() = host.getSharedPreferences("message-notifications", 0)
  private var pendingOpen: JSObject? = null

  override fun load(webView: WebView) {
    active = WeakReference(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val name = if (Locale.getDefault().language == "zh") "消息" else "Messages"
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL, name, NotificationManager.IMPORTANCE_HIGH)
      )
    }
    readTap(host.intent)
  }

  override fun onNewIntent(intent: Intent) {
    readTap(intent)
  }

  private fun readTap(intent: Intent?) {
    if (intent == null) return
    val values = targetKeys.map { intent.getStringExtra(it)?.takeIf(String::isNotBlank) ?: return }
    targetKeys.forEach { intent.removeExtra(it) }
    pendingOpen = JSObject().apply {
      targetKeys.zip(values).forEach { (key, value) -> put(key, value) }
    }
    trigger("open", JSObject())
  }

  @Command
  fun takeOpen(invoke: Invoke) {
    host.runOnUiThread {
      val target = pendingOpen
      pendingOpen = null
      if (target == null) invoke.resolve() else invoke.resolve(target)
    }
  }

  private fun status(): String {
    if (NotificationManagerCompat.from(host).areNotificationsEnabled()) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        manager.getNotificationChannel(CHANNEL)?.importance == NotificationManager.IMPORTANCE_NONE
      ) return "denied"
      permissionHistory.edit().putBoolean("requested", true).apply()
      return "granted"
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      !permissionHistory.getBoolean("requested", false) &&
      !host.shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)
    ) return "default"
    return "denied"
  }

  @Command
  fun permissionStatus(invoke: Invoke) {
    invoke.resolveObject(status())
  }

  @Command
  fun requestPermission(invoke: Invoke) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || status() == "granted") {
      invoke.resolveObject(status() == "granted")
      return
    }
    permissionHistory.edit().putBoolean("requested", true).apply()
    requestPermissionForAlias("messages", invoke, "permissionResult")
  }

  @PermissionCallback
  fun permissionResult(invoke: Invoke) {
    invoke.resolveObject(status() == "granted")
  }

  @Command
  fun pushRegistration(invoke: Invoke) {
    if (FirebaseApp.getApps(host).isEmpty()) {
      invoke.resolve()
      return
    }
    val messaging = FirebaseMessaging.getInstance()
    val granted = status() == "granted"
    messaging.isAutoInitEnabled = granted
    if (!granted) {
      invoke.resolve()
      return
    }
    messaging.token.addOnCompleteListener { result ->
      if (result.isSuccessful && status() == "granted") invoke.resolve(registration(result.result))
      else invoke.resolve()
    }
  }

  companion object {
    @Volatile
    private var active = WeakReference<YonderNotificationsPlugin>(null)

    private fun registration(token: String) = JSObject().put("provider", "fcm").put("token", token)

    fun tokenChanged(token: String) {
      active.get()?.let { plugin ->
        if (plugin.status() == "granted") plugin.trigger("token", registration(token))
      }
    }
  }
}

// The SDK displays notification+data pushes in the background. In the foreground the realtime
// connection updates messages and unread counts without showing a reminder.
class YonderFirebaseMessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) {
    YonderNotificationsPlugin.tokenChanged(token)
  }
}

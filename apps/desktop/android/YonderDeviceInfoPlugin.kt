package net.yonderbot.app

import android.app.Activity
import android.os.Build
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@TauriPlugin
class YonderDeviceInfoPlugin(private val host: Activity) : Plugin(host) {
  @Command
  fun systemName(invoke: Invoke) {
    val name = try {
      if (Build.VERSION.SDK_INT >= 25) {
        Settings.Global.getString(host.contentResolver, Settings.Global.DEVICE_NAME)
      } else null
    } catch (_: SecurityException) {
      null
    }
    invoke.resolveObject(name?.takeIf { it.isNotBlank() } ?: Build.MODEL)
  }
}

package net.yonderbot.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@InvokeArg
class DeviceDownloadShareArgs {
  lateinit var url: String
}

@TauriPlugin
class YonderDeviceDownloadPlugin(private val host: Activity) : Plugin(host) {
  @Command
  fun share(invoke: Invoke) {
    val url = invoke.parseArgs(DeviceDownloadShareArgs::class.java).url
    val intent = Intent(Intent.ACTION_SEND).apply {
      type = "text/plain"
      putExtra(Intent.EXTRA_TEXT, url)
    }
    try {
      host.startActivity(Intent.createChooser(intent, null))
      invoke.resolve()
    } catch (error: ActivityNotFoundException) {
      invoke.reject("The system share sheet could not be opened.", error)
    }
  }
}

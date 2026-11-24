package net.yonderbot.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.HttpsURLConnection
import kotlin.concurrent.thread

@InvokeArg
class UpdateDownloadArgs {
  lateinit var url: String
  lateinit var sha256: String
  lateinit var onProgress: Channel
}

@InvokeArg
class UpdateInstallArgs {
  lateinit var sha256: String
}

@TauriPlugin
class UpdatePlugin(private val activity: Activity) : Plugin(activity) {
  companion object {
    private val updating = AtomicBoolean(false)
    private val digestPattern = Regex("[0-9a-fA-F]{64}")
    // Only a checksum-verified download in this process can arm an install.
    private var stagedDigest: String? = null
  }

  private val directory get() = File(activity.cacheDir, "updates")
  // An installer already granted a URI must never read a replacement APK at that URI.
  private fun stagedApk(digest: String) = File(directory, "update-$digest.apk")

  @Command
  fun versionCode(invoke: Invoke) {
    val info = activity.packageManager.getPackageInfo(activity.packageName, 0)
    val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else {
      @Suppress("DEPRECATION")
      info.versionCode.toLong()
    }
    val result = JSObject()
    result.put("versionCode", code)
    invoke.resolve(result)
  }

  @Command
  fun latest(invoke: Invoke) {
    thread {
      try {
        val connection = connection("https://dl.zethai.cn/android/latest.json")
        try {
          // A release manifest is small; reject an unexpectedly large response.
          val output = ByteArrayOutputStream()
          connection.inputStream.use { input ->
            val buffer = ByteArray(8192)
            while (true) {
              val count = input.read(buffer)
              if (count < 0) break
              require(output.size() + count <= 256 * 1024)
              output.write(buffer, 0, count)
            }
          }
          invoke.resolve(JSObject(output.toString("UTF-8")))
        } finally {
          connection.disconnect()
        }
      } catch (_: Exception) {
        invoke.reject("update manifest unavailable")
      }
    }
  }

  @Command
  fun downloadAndInstall(invoke: Invoke) = stage(invoke, installAfterDownload = true)

  @Command
  fun download(invoke: Invoke) = stage(invoke, installAfterDownload = false)

  @Command
  fun install(invoke: Invoke) {
    if (!updating.compareAndSet(false, true)) {
      invoke.reject("ongoing update")
      return
    }
    activity.runOnUiThread { openInstaller(invoke) }
  }

  private fun stage(invoke: Invoke, installAfterDownload: Boolean) {
    val args: UpdateDownloadArgs
    val expected: String
    try {
      args = invoke.parseArgs(UpdateDownloadArgs::class.java)
      require(digestPattern.matches(args.sha256))
      expected = args.sha256.lowercase(Locale.ROOT)
    } catch (_: Exception) {
      invoke.reject("invalid update")
      return
    }
    if (!updating.compareAndSet(false, true)) {
      invoke.reject("ongoing update")
      return
    }
    thread {
      val temporary = File(directory, "update.apk.part")
      try {
        val url = URL(args.url)
        require(url.protocol == "https" && url.host == "dl.zethai.cn" && url.port == -1 &&
          url.userInfo == null && url.path.startsWith("/android/") && url.path.endsWith(".apk"))
        check(directory.exists() || directory.mkdirs())
        val hash = MessageDigest.getInstance("SHA-256")
        val connection = connection(args.url)
        try {
          val total = connection.contentLengthLong.coerceAtLeast(0)
          var downloaded = 0L
          var lastReported = 0L
          connection.inputStream.use { input ->
            temporary.outputStream().use { output ->
              val buffer = ByteArray(64 * 1024)
              while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                output.write(buffer, 0, count)
                hash.update(buffer, 0, count)
                downloaded += count
                if (downloaded - lastReported >= 256 * 1024) {
                  args.onProgress.sendObject(mapOf("downloaded" to downloaded, "total" to total))
                  lastReported = downloaded
                }
              }
            }
          }
          args.onProgress.sendObject(mapOf("downloaded" to downloaded, "total" to total))
        } finally {
          connection.disconnect()
        }
        val digest = hash.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
        require(digest == expected)
        check(temporary.renameTo(stagedApk(expected)))
        stagedDigest = expected
      } catch (_: Exception) {
        temporary.delete()
        updating.set(false)
        invoke.reject("update download failed")
        return@thread
      }

      if (installAfterDownload) {
        activity.runOnUiThread { openInstaller(invoke) }
      } else {
        updating.set(false)
        invoke.resolve()
      }
    }
  }

  private fun verifiedApk(invoke: Invoke): File {
    val digest = invoke.parseArgs(UpdateInstallArgs::class.java).sha256
    require(digestPattern.matches(digest))
    val expected = digest.lowercase(Locale.ROOT)
    check(expected == stagedDigest)
    return stagedApk(expected).also { check(it.isFile) }
  }

  private fun openInstaller(invoke: Invoke) {
    try {
      val apk = verifiedApk(invoke)
      if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
        val settings = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
        startActivityForResult(invoke, settings, "installPermissionResult")
      } else {
        launchInstaller(invoke, apk)
      }
    } catch (_: Exception) {
      invoke.reject("update installer unavailable")
    } finally {
      updating.set(false)
    }
  }

  @ActivityCallback
  private fun installPermissionResult(invoke: Invoke, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
    if (!updating.compareAndSet(false, true)) {
      invoke.reject("ongoing update")
      return
    }
    try {
      if (Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
        invoke.reject("install permission denied")
        return
      }
      // The candidate may have changed while Android Settings was open.
      launchInstaller(invoke, verifiedApk(invoke))
    } catch (_: Exception) {
      invoke.reject("update installer unavailable")
    } finally {
      updating.set(false)
    }
  }

  private fun launchInstaller(invoke: Invoke, apk: File) {
    val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apk)
    val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    // Android enforces the installed app's signing certificate; a different key cannot replace it.
    activity.startActivity(intent)
    invoke.resolve()
  }

  private fun connection(url: String): HttpsURLConnection {
    val connection = URL(url).openConnection() as HttpsURLConnection
    connection.connectTimeout = 15_000
    connection.readTimeout = 30_000
    connection.instanceFollowRedirects = false
    if (connection.responseCode != 200) {
      connection.disconnect()
      error("update server returned an error")
    }
    return connection
  }
}

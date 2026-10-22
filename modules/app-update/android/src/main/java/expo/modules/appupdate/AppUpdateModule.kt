package expo.modules.appupdate

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.FileProvider
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

class AppUpdateModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("AppUpdate")
    Function("isApkInstallationEnabled") { apkInstallationEnabled() }
    Function("canInstallPackages") {
      apkInstallationEnabled() &&
        (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls())
    }
    AsyncFunction("installApk") {
      check(apkInstallationEnabled()) { "APK installation is disabled for this distribution" }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
        "permissionRequired"
      } else {
        val file = File(context.cacheDir, "app-updates/update.apk")
        if (runCatching { validateApk(file) }.isFailure) {
          "invalidPackage"
        } else {
          val uri = FileProvider.getUriForFile(context, "${context.packageName}.app-update", file)
          val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(intent)
          // Opening the installer is not proof of installation. The next process reads its native version.
          "opened"
        }
      }
    }
    AsyncFunction("checkPlayUpdate") { promise: Promise ->
      val handler = Handler(Looper.getMainLooper())
      val settled = AtomicBoolean(false)
      val timeout = Runnable {
        if (settled.compareAndSet(false, true)) {
          promise.reject("ERR_STORE_TIMEOUT", "Google Play update check timed out", null)
        }
      }
      handler.postDelayed(timeout, 10_000)
      AppUpdateManagerFactory.create(context).appUpdateInfo
        .addOnSuccessListener { info ->
          if (settled.compareAndSet(false, true)) {
            handler.removeCallbacks(timeout)
            val availability = info.updateAvailability()
            if (availability == UpdateAvailability.UNKNOWN) {
              promise.reject("ERR_STORE_UNAVAILABLE", "Google Play update status is unknown", null)
            } else {
              promise.resolve(mapOf(
                "available" to (availability == UpdateAvailability.UPDATE_AVAILABLE ||
                  availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS),
                "versionCode" to info.availableVersionCode(),
              ))
            }
          }
        }
        .addOnFailureListener { error ->
          if (settled.compareAndSet(false, true)) {
            handler.removeCallbacks(timeout)
            promise.reject("ERR_STORE_CHECK", "Google Play update check failed", error)
          }
        }
    }
  }

  @Suppress("DEPRECATION")
  private fun apkInstallationEnabled(): Boolean {
    val info = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
    if (info.metaData?.getBoolean("expo.modules.appupdate.APK_UPDATES_ENABLED", false) != true) return false
    // Read the embedded manifest, never mutable JS config or an OTA-supplied header override.
    val headers = info.metaData?.getString("expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY") ?: "{}"
    val channel = JSONObject(headers).optString("expo-channel-name")
    return channel == "production-apk" ||
      (channel.isEmpty() && info.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0)
  }

  @Suppress("DEPRECATION")
  private fun validateApk(file: File) {
    check(file.isFile && file.canonicalFile == File(context.cacheDir.canonicalFile, "app-updates/update.apk")) {
      "The downloaded APK is unavailable"
    }
    val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
    val installed = context.packageManager.getPackageInfo(context.packageName, flags)
    val archive = requireNotNull(context.packageManager.getPackageArchiveInfo(file.path, flags)) { "Invalid APK" }
    check(archive.packageName == context.packageName) { "APK package does not match" }
    check(versionCode(archive) > versionCode(installed)) { "APK is not a newer build" }
    val installedSigners = signatures(installed)
    val archiveSigners = signatures(archive)
    check(installedSigners.isNotEmpty() && installedSigners == archiveSigners) { "APK signing certificate does not match" }
  }

  @Suppress("DEPRECATION")
  private fun versionCode(info: PackageInfo): Long =
    if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()

  @Suppress("DEPRECATION")
  private fun signatures(info: PackageInfo): Set<String> =
    (if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures)
      ?.map { it.toCharsString() }?.toSet() ?: emptySet()
}

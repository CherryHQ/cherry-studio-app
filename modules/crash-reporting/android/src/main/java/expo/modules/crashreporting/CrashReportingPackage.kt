package expo.modules.crashreporting

import android.app.Application
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

class CrashReportingPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) {
        // Runs before React creates the JS runtime. Do not let diagnostics block app startup.
        runCatching {
          val metadata = application.packageManager.getApplicationInfo(
            application.packageName, PackageManager.GET_META_DATA
          ).metaData
          val isDebug = application.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
          CrashReportingState.configure(
            application,
            metadata?.getString("CherryCrashReportingDsn") ?: "",
            !isDebug && metadata?.getBoolean("CherryCrashReportingEnabled") == true,
            // Android may parse the existing numeric policy version as an integer.
            metadata?.get("CherryCrashReportingConsentVersion")?.toString() ?: ""
          )
        }.onFailure { CrashReportingState.recordStartupFailure() }
      }
    })
}

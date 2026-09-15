package expo.modules.crashreporting

import android.content.Context
import android.util.AtomicFile
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import io.sentry.Sentry
import io.sentry.IConnectionStatusProvider.ConnectionStatus
import io.sentry.android.core.SentryAndroid
import java.io.File

class CrashReportingModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CrashReporting")
    // Consent lookup, cache cleanup, and SDK startup do disk work; keep them off the JS thread.
    AsyncFunction("configure") { dsn: String, isProduction: Boolean, version: String ->
      CrashReportingState.configure(
        requireNotNull(appContext.reactContext).applicationContext, dsn, isProduction, version
      )
    }
    Function("getStatus") { CrashReportingState.status() }
    AsyncFunction("setConsent") { enabled: Boolean -> CrashReportingState.setConsent(enabled) }
  }
}

private object CrashReportingState {
  private var configured = false
  private var consentVersion = ""
  private var dsn = ""
  private var canCapture = false
  private var captureStartedAt = 0L
  @Volatile private var granted = false
  @Volatile private var active = false

  private lateinit var context: Context
  private val consentFile get() = File(context.noBackupFilesDir, "cherry-crash-reporting-consent")
  private val cacheDir get() = File(context.cacheDir, "cherry-crash-reporting")

  @Synchronized
  fun configure(context: Context, dsn: String, isProduction: Boolean, version: String): Map<String, Boolean> {
    this.context = context
    this.dsn = dsn
    canCapture = isProduction && dsn.isNotEmpty()
    if (configured) {
      if (version != consentVersion || (!canCapture && active)) {
        consentVersion = version
        revoke()
      }
      return status()
    }
    configured = true
    consentVersion = version
    val saved = runCatching {
      AtomicFile(consentFile).readFully().toString(Charsets.UTF_8).split('\n')
    }.getOrDefault(emptyList())
    val startedAt = saved.getOrNull(1)?.toLongOrNull()
    if (saved.size == 2 && saved[0] == version && startedAt != null && startedAt > 0L) {
      granted = true
      captureStartedAt = startedAt
    } else {
      // Nothing recorded without a grant for this disclosure may be sent, including legacy reports.
      AtomicFile(consentFile).delete()
      cleanCaches()
    }
    if (granted && canCapture) start()
    return status()
  }

  @Synchronized
  fun setConsent(enabled: Boolean): Map<String, Boolean> {
    if (!enabled) {
      revoke()
      return status()
    }
    if (!granted) {
      // The grant time rejects system ANR history from before consent on later launches.
      captureStartedAt = System.currentTimeMillis()
      persistConsent()
      granted = true
    }
    if (canCapture && !active) start()
    return status()
  }

  private fun persistConsent() {
    val file = AtomicFile(consentFile)
    val output = file.startWrite()
    try {
      output.write("$consentVersion\n$captureStartedAt".toByteArray(Charsets.UTF_8))
      file.finishWrite(output)
    } catch (error: Throwable) {
      file.failWrite(output)
      throw error
    }
  }

  private fun revoke() {
    // The gates close before persistence, SDK shutdown, and cache cleanup.
    granted = false
    active = false
    AtomicFile(consentFile).delete()
    Sentry.close()
    check(!consentFile.exists()) { "Could not remove crash reporting consent" }
    cleanCaches()
  }

  fun status() = mapOf("enabled" to granted, "active" to (active && granted))

  private fun cleanCaches() {
    check(!cacheDir.exists() || cacheDir.deleteRecursively()) { "Could not remove crash reporting cache" }
    // Legacy reports were captured before this app recorded consent.
    val legacy = File(context.cacheDir, "sentry")
    check(!legacy.exists() || legacy.deleteRecursively()) { "Could not remove legacy crash reports" }
  }

  private fun start() {
    active = true
    SentryAndroid.init(context) { options ->
      options.dsn = dsn
      options.environment = "production"
      options.cacheDirPath = cacheDir.absolutePath
      options.isSendDefaultPii = false
      options.isSendClientReports = false
      options.maxBreadcrumbs = 0
      options.isEnableAutoSessionTracking = false
      options.isEnableActivityLifecycleBreadcrumbs = false
      options.isEnableAppLifecycleBreadcrumbs = false
      options.isEnableSystemEventBreadcrumbs = false
      options.isEnableAppComponentBreadcrumbs = false
      options.isEnableNetworkEventBreadcrumbs = false
      options.isEnableUserInteractionBreadcrumbs = false
      options.isEnableAutoActivityLifecycleTracing = false
      options.isEnableUserInteractionTracing = false
      options.isEnableFramesTracking = false
      options.isAttachScreenshot = false
      options.isAttachViewHierarchy = false
      options.logs.isEnabled = false
      options.isEnableNdk = true
      options.isEnableScopeSync = false
      options.setTransportGate {
        active && granted &&
          options.connectionStatusProvider.connectionStatus != ConnectionStatus.DISCONNECTED
      }
      options.setBeforeSend { event, _ ->
        // Android can recover ANRs from OS history even when Sentry was not running at the time.
        if (active && granted && event.timestamp.time >= captureStartedAt) {
          sanitizeCrashEvent(event)
        } else null
      }
    }
    if (!Sentry.isEnabled()) active = false
  }
}

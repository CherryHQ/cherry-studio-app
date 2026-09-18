package expo.modules.crashreporting

import android.content.Context
import android.content.pm.PackageManager
import android.util.AtomicFile
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import io.sentry.Breadcrumb
import io.sentry.IConnectionStatusProvider.ConnectionStatus
import io.sentry.Sentry
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

internal object CrashReportingState {
  private var configured = false
  @Volatile private var consentVersion = ""
  private var dsn = ""
  private var canCapture = false
  private var captureStartedAt = 0L
  @Volatile private var granted = false
  @Volatile private var active = false
  @Volatile private var initialization = "not_started"
  @Volatile var breadcrumbCodes: Set<String> = emptySet()
    private set
  @Volatile var breadcrumbLimit = 20
    private set

  private lateinit var context: Context
  private val consentFile get() = File(context.noBackupFilesDir, "cherry-crash-reporting-consent")
  private val cacheDir get() = File(context.cacheDir, "cherry-crash-reporting")

  @Synchronized
  fun configure(context: Context, dsn: String, isProduction: Boolean, version: String): Map<String, Any> {
    return try {
      configureOwner(context, dsn, isProduction, version)
    } catch (error: Throwable) {
      recordStartupFailure()
      configured = false
      throw error
    }
  }

  fun recordStartupFailure() {
    active = false
    granted = false
    initialization = "failed"
    Sentry.close()
  }

  private fun configureOwner(context: Context, dsn: String, isProduction: Boolean, version: String): Map<String, Any> {
    this.context = context
    val metadata = context.packageManager.getApplicationInfo(
      context.packageName, PackageManager.GET_META_DATA
    ).metaData
    breadcrumbCodes = (metadata?.getString("CherryCrashReportingBreadcrumbs") ?: "")
      .split('|').filter { it.isNotEmpty() }.toSet()
    breadcrumbLimit = metadata?.getInt("CherryCrashReportingMaxBreadcrumbs", 20) ?: 20
    this.dsn = dsn
    canCapture = isProduction && dsn.isNotEmpty()
    if (configured) {
      if (version != consentVersion || (!canCapture && active)) {
        consentVersion = version
        revoke()
      } else if (canCapture && granted && !active) {
        start()
      }
      return status()
    }
    configured = true
    consentVersion = version
    // Apply the default only on first use. Preserve AtomicFile's backup of an existing choice too.
    if (version.isNotEmpty() && !consentFile.exists() && !File("${consentFile.path}.bak").exists()) {
      cleanCaches()
      captureStartedAt = System.currentTimeMillis()
      persistConsent()
    }
    val saved = runCatching {
      AtomicFile(consentFile).readFully().toString(Charsets.UTF_8).split('\n')
    }.getOrDefault(emptyList())
    val startedAt = saved.getOrNull(1)?.toLongOrNull()
    // Unreadable or obsolete records never silently re-enable reporting.
    if (version.isNotEmpty() && saved.size == 2 && saved[0] == version && startedAt != null && startedAt > 0L) {
      granted = true
      captureStartedAt = startedAt
    } else {
      // Nothing recorded without a grant for this disclosure may be sent, including legacy reports.
      cleanCaches()
    }
    if (granted && canCapture) start()
    initialization = if (active) "ready" else if (granted && canCapture) "failed" else "inactive"
    return status()
  }

  @Synchronized
  fun setConsent(enabled: Boolean): Map<String, Any> {
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

  private fun persistConsent(enabled: Boolean = true) {
    val file = AtomicFile(consentFile)
    val output = file.startWrite()
    try {
      val value = if (enabled) "$consentVersion\n$captureStartedAt" else "disabled"
      output.write(value.toByteArray(Charsets.UTF_8))
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
    initialization = "inactive"
    Sentry.close()
    persistConsent(false)
    cleanCaches()
  }

  fun status(): Map<String, Any> = mapOf(
    "enabled" to granted, "active" to (active && granted),
    "consentVersion" to consentVersion, "initialization" to initialization
  )

  private fun addBreadcrumb(code: String) {
    if (!active || !granted || code !in breadcrumbCodes) return
    Sentry.addBreadcrumb(Breadcrumb().apply {
      category = "app.diagnostic"
      message = code
    })
  }

  private fun cleanCaches() {
    check(!cacheDir.exists() || cacheDir.deleteRecursively()) { "Could not remove crash reporting cache" }
    // Legacy reports were captured before this app recorded consent.
    val legacy = File(context.cacheDir, "sentry")
    check(!legacy.exists() || legacy.deleteRecursively()) { "Could not remove legacy crash reports" }
  }

  private fun start() {
    active = true
    initialization = "starting"
    SentryAndroid.init(context) { options ->
      options.dsn = dsn
      options.environment = "production"
      options.cacheDirPath = cacheDir.absolutePath
      options.isSendDefaultPii = false
      options.isSendClientReports = false
      options.maxBreadcrumbs = breadcrumbLimit
      options.setBeforeBreadcrumb { breadcrumb, _ -> sanitizeCrashBreadcrumb(breadcrumb) }
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
    initialization = if (active) "ready" else "failed"
    addBreadcrumb("startup.native")
  }
}

package expo.modules.crashreporting

import android.content.Context
import android.util.AtomicFile
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import io.sentry.Sentry
import io.sentry.IConnectionStatusProvider.ConnectionStatus
import io.sentry.android.core.SentryAndroid
import java.io.File
import java.util.UUID

class CrashReportingModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CrashReporting")
    Function("configure") { dsn: String, isProduction: Boolean, version: String ->
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
  @Volatile private var consentToken = ""
  @Volatile private var activeToken = ""
  private var captureStartedAt = 0L

  private lateinit var context: Context
  private val consentFile get() = File(context.noBackupFilesDir, "cherry-crash-reporting-consent")
  private val cacheRoot get() = File(context.cacheDir, "cherry-crash-reporting")

  @Synchronized
  fun configure(context: Context, dsn: String, isProduction: Boolean, version: String): Map<String, Boolean> {
    this.context = context
    val canCapture = isProduction && dsn.isNotEmpty()
    if (configured) {
      if (version != consentVersion || (!canCapture && activeToken.isNotEmpty())) {
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
    if (saved.size == 3 && saved[0] == version &&
      runCatching { UUID.fromString(saved[1]) }.isSuccess &&
      saved[2].toLongOrNull()?.let { it >= 0L } == true) {
      consentToken = saved[1]
      captureStartedAt = saved[2].toLong()
    }
    cleanCaches(if (canCapture) consentToken else "")
    if (consentToken.isNotEmpty()) {
      if (canCapture) {
        if (captureStartedAt == 0L) {
          captureStartedAt = System.currentTimeMillis()
          persistConsent(consentToken, captureStartedAt)
        }
        try {
          start(dsn, consentToken)
        } catch (error: Throwable) {
          activeToken = ""
          Sentry.close()
          throw error
        }
      } else {
        captureStartedAt = 0L
        persistConsent(consentToken, captureStartedAt)
      }
    }
    return status()
  }

  @Synchronized
  fun setConsent(enabled: Boolean): Map<String, Boolean> {
    if (enabled) {
      if (consentToken.isEmpty()) {
        val token = UUID.randomUUID().toString()
        persistConsent(token, 0L)
        consentToken = token
      }
    } else {
      revoke()
    }
    // A new grant only takes effect in the next process, with a new cache directory.
    return status()
  }

  private fun persistConsent(token: String, startedAt: Long) {
    val file = AtomicFile(consentFile)
    val output = file.startWrite()
    try {
      output.write("$consentVersion\n$token\n$startedAt".toByteArray(Charsets.UTF_8))
      file.finishWrite(output)
    } catch (error: Throwable) {
      file.failWrite(output)
      throw error
    }
  }

  private fun revoke() {
    // This gate closes before persistence, SDK shutdown, and cache cleanup.
    consentToken = ""
    activeToken = ""
    AtomicFile(consentFile).delete()
    Sentry.close()
    check(!consentFile.exists()) { "Could not remove crash reporting consent" }
    cleanCaches("")
  }

  fun status() = mapOf(
    "enabled" to consentToken.isNotEmpty(),
    "active" to (activeToken.isNotEmpty() && activeToken == consentToken)
  )

  private fun cleanCaches(keeping: String) {
    cacheRoot.listFiles()?.filter { it.name != keeping }?.forEach {
      check(it.deleteRecursively()) { "Could not remove crash reporting cache" }
    }
    // Legacy reports were captured before this app recorded consent.
    val legacy = File(context.cacheDir, "sentry")
    if (legacy.exists()) check(legacy.deleteRecursively()) { "Could not remove legacy crash reports" }
  }

  private fun start(dsn: String, token: String) {
    activeToken = token
    SentryAndroid.init(context) { options ->
      options.dsn = dsn
      options.environment = "production"
      options.cacheDirPath = File(cacheRoot, token).absolutePath
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
        activeToken == token && consentToken == token &&
          options.connectionStatusProvider.connectionStatus != ConnectionStatus.DISCONNECTED
      }
      options.setBeforeSend { event, _ ->
        // Android can recover ANRs from OS history even when Sentry was not running at the time.
        if (activeToken == token && consentToken == token && event.timestamp.time >= captureStartedAt) {
          sanitizeCrashEvent(event)
        } else null
      }
    }
    if (!Sentry.isEnabled()) activeToken = ""
  }
}

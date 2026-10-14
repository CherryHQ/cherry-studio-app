package expo.modules.crashreporting

import io.sentry.SentryEvent
import io.sentry.Breadcrumb
import io.sentry.SentryLevel
import io.sentry.protocol.Device
import io.sentry.protocol.OperatingSystem
import io.sentry.protocol.SentryStackTrace

internal fun sanitizeCrashBreadcrumb(crumb: Breadcrumb): Breadcrumb? {
  if (crumb.category != "app.diagnostic" || crumb.message !in CrashReportingState.breadcrumbCodes) return null
  return Breadcrumb(crumb.timestamp).apply {
    category = "app.diagnostic"
    message = crumb.message
    level = SentryLevel.INFO
  }
}

// Copied from the JS scope by expoContextIntegration. Matches the JS event filter.
private val otaUpdateFields = setOf(
  "is_enabled", "is_embedded_launch", "is_emergency_launch", "update_id", "channel", "runtime_version",
)
private val updateIdPattern = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
private val channelPattern = Regex("^[a-zA-Z_$][a-zA-Z0-9_$.-]{0,99}$")

private fun cleanStack(stack: SentryStackTrace?) {
  stack?.frames?.forEach { frame ->
    frame.vars = null
    frame.preContext = null
    frame.postContext = null
    frame.contextLine = null
    frame.absPath = null
  }
}

/** Delete free-form fields in place. Error classification, stacks, and debug images stay as produced. */
internal fun sanitizeCrashEvent(event: SentryEvent): SentryEvent? {
  // A native fatal is still useful when the JS handler could not initialize or deliver its event.
  val isJavaScriptFatal = event.exceptions?.any { it.type == "JavascriptException" } == true

  event.message = null
  event.logger = null
  event.serverName = null
  event.transaction = null
  event.fingerprints = null
  event.setModules(null)
  event.extras = null
  event.user = null
  event.request = null
  event.breadcrumbs = event.breadcrumbs?.mapNotNull(::sanitizeCrashBreadcrumb)
    ?.takeLast(CrashReportingState.breadcrumbLimit)
  event.unknown = null
  event.tags = mapOf("event.origin" to "native", "event.platform" to "android")
  if (isJavaScriptFatal) event.setTag("error.kind", "javascript_fatal")

  val os = event.contexts.operatingSystem?.let { original ->
    OperatingSystem().apply {
      name = original.name
      version = original.version
      build = original.build
      kernelVersion = original.kernelVersion
    }
  }
  val device = event.contexts.device?.let { original ->
    Device().apply {
      family = original.family
      model = original.model
      modelId = original.modelId
      archs = original.archs
      memorySize = original.memorySize
      isSimulator = original.isSimulator
    }
  }
  val updates = (event.contexts.get("ota_updates") as? Map<*, *>)
    ?.filterKeys { it is String && it in otaUpdateFields }
  event.contexts.keys().toList().forEach { event.contexts.remove(it) }
  os?.let { event.contexts.setOperatingSystem(it) }
  device?.let { event.contexts.setDevice(it) }
  updates?.let { event.contexts.put("ota_updates", it) }
  (updates?.get("update_id") as? String)?.takeIf { updateIdPattern.matches(it) }
    ?.let { event.setTag("ota.update_id", it) }
  (updates?.get("channel") as? String)?.takeIf { channelPattern.matches(it) }
    ?.let { event.setTag("ota.channel", it) }
  (updates?.get("is_embedded_launch") as? Boolean)?.let { event.setTag("ota.embedded", it.toString()) }

  event.exceptions?.forEach { exception ->
    exception.value = "Error details omitted for privacy"
    exception.mechanism?.let {
      it.description = null
      it.data = null
      it.helpLink = null
      it.meta = null
    }
    cleanStack(exception.stacktrace)
  }
  event.threads?.forEach {
    it.name = null
    cleanStack(it.stacktrace)
  }
  return event
}

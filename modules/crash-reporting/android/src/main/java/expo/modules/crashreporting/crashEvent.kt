package expo.modules.crashreporting

import io.sentry.SentryEvent
import io.sentry.protocol.Device
import io.sentry.protocol.OperatingSystem
import io.sentry.protocol.SentryStackTrace

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
  // React Native already reports these through its JavaScript error handler.
  if (event.exceptions?.any { it.type == "JavascriptException" } == true) return null

  event.message = null
  event.logger = null
  event.serverName = null
  event.transaction = null
  event.fingerprints = null
  event.setModules(null)
  event.extras = null
  event.user = null
  event.request = null
  event.breadcrumbs = null
  event.unknown = null
  event.tags = mapOf("event.origin" to "native", "event.platform" to "android")

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
  event.contexts.keys().toList().forEach { event.contexts.remove(it) }
  os?.let { event.contexts.setOperatingSystem(it) }
  device?.let { event.contexts.setDevice(it) }

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

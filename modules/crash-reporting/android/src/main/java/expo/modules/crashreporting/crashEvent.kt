package expo.modules.crashreporting

import io.sentry.SentryEvent
import io.sentry.protocol.Device
import io.sentry.protocol.OperatingSystem
import io.sentry.protocol.SentryStackTrace

private val identifier = Regex("^[a-zA-Z_$][a-zA-Z0-9_$.-]{0,99}$")
private val symbol = Regex("^[a-zA-Z0-9_$ .:<>()\\[\\]+*~&,-]{1,200}$")
private val sourceName = Regex("^[a-zA-Z0-9_.-]{1,200}$")
private fun cleanIdentifier(value: String?) = value?.takeIf { identifier.matches(it) }
private fun cleanSymbol(value: String?) = value?.takeIf { symbol.matches(it) }
private fun fileName(value: String?) = value?.substringBefore('?')?.substringBefore('#')
  ?.substringAfterLast('/')?.substringAfterLast('\\')?.takeIf { sourceName.matches(it) }

private fun cleanStack(stack: SentryStackTrace?) {
  stack?.unknown = null
  stack?.frames?.forEach { frame ->
    frame.vars = null
    frame.preContext = null
    frame.postContext = null
    frame.contextLine = null
    frame.absPath = null
    frame.filename = fileName(frame.filename)
    frame.`package` = fileName(frame.`package`)
    frame.module = cleanIdentifier(frame.module)
    frame.function = cleanSymbol(frame.function)
    frame.rawFunction = cleanSymbol(frame.rawFunction)
    frame.symbol = cleanSymbol(frame.symbol)
    frame.unknown = null
  }
}

internal fun sanitizeCrashEvent(source: SentryEvent): SentryEvent? {
  if (source.exceptions?.any { it.type == "JavascriptException" } == true) return null
  val event = SentryEvent()
  event.eventId = source.eventId
  event.timestamp = source.timestamp
  event.level = source.level
  event.platform = source.platform
  event.release = source.release
  event.dist = source.dist
  event.environment = source.environment
  event.sdk = source.sdk
  event.tags = mapOf("event.origin" to "native", "event.platform" to "android")
  source.contexts.operatingSystem?.let { original ->
    event.contexts.operatingSystem = OperatingSystem().apply {
      name = original.name
      version = original.version
      build = original.build
      kernelVersion = original.kernelVersion
    }
  }
  source.contexts.device?.let { original ->
    event.contexts.device = Device().apply {
      family = original.family
      model = original.model
      modelId = original.modelId
      archs = original.archs
      memorySize = original.memorySize
      isSimulator = original.isSimulator
    }
  }
  event.exceptions = source.exceptions
  event.exceptions?.forEach { exception ->
    exception.type = cleanIdentifier(exception.type) ?: "NativeError"
    exception.value = "Error details omitted for privacy"
    exception.module = cleanIdentifier(exception.module)
    exception.unknown = null
    exception.mechanism?.let {
      it.description = null
      it.data = null
      it.helpLink = null
      it.meta = null
      it.unknown = null
    }
    cleanStack(exception.stacktrace)
  }
  event.threads = source.threads
  event.threads?.forEach {
    it.name = null
    it.unknown = null
    cleanStack(it.stacktrace)
  }
  event.debugMeta = source.debugMeta
  event.debugMeta?.unknown = null
  event.debugMeta?.images?.forEach {
    it.codeFile = fileName(it.codeFile)
    it.debugFile = fileName(it.debugFile)
    it.unknown = null
  }
  return event
}

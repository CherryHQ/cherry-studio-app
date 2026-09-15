import Foundation
import Sentry

private func identifier(_ value: String?) -> String? {
  guard let value,
    value.range(of: "^[a-zA-Z_$][a-zA-Z0-9_$.-]{0,99}$", options: .regularExpression) != nil
  else { return nil }
  return value
}

private func symbol(_ value: String?) -> String? {
  guard let value,
    value.range(of: "^[a-zA-Z0-9_$ .:<>()\\[\\]+*~&,-]{1,200}$", options: .regularExpression) != nil
  else { return nil }
  return value
}

private func fileName(_ value: String?) -> String? {
  guard let value else { return nil }
  let path = value.components(separatedBy: CharacterSet(charactersIn: "?#"))[0]
  let name = (path as NSString).lastPathComponent
  return name.range(of: "^[a-zA-Z0-9_.-]{1,200}$", options: .regularExpression) != nil ? name : nil
}

private func cleanStack(_ stack: SentryStacktrace?) {
  for frame in stack?.frames ?? [] {
    frame.vars = nil
    frame.contextLine = nil
    frame.preContext = nil
    frame.postContext = nil
    frame.fileName = fileName(frame.fileName)
    frame.package = fileName(frame.package)
    frame.module = identifier(frame.module)
    frame.function = symbol(frame.function)
  }
}

func sanitizeCrashEvent(_ source: Event) -> Event? {
  // React Native already reports these through its JavaScript error handler.
  if source.exceptions?.contains(where: {
    $0.type.contains("Unhandled JS Exception")
      || $0.value.contains("ExceptionsManager.reportException")
  }) == true {
    return nil
  }

  let event = Event(level: source.level)
  event.eventId = source.eventId
  event.timestamp = source.timestamp
  event.platform = source.platform
  event.releaseName = source.releaseName
  event.dist = source.dist
  event.environment = source.environment
  event.sdk = source.sdk
  event.tags = ["event.origin": "native", "event.platform": "ios"]

  var context: [String: [String: Any]] = [:]
  for (key, fields) in [
    "os": ["name", "version", "build", "kernel_version"],
    "device": ["family", "model", "model_id", "arch", "simulator", "memory_size"],
  ] {
    if let original = source.context?[key] {
      context[key] = original.filter { fields.contains($0.key) }
    }
  }
  event.context = context
  event.exceptions = source.exceptions
  for exception in event.exceptions ?? [] {
    exception.type = identifier(exception.type) ?? "NativeError"
    exception.value = "Error details omitted for privacy"
    exception.module = identifier(exception.module)
    exception.mechanism?.desc = nil
    exception.mechanism?.data = nil
    exception.mechanism?.helpLink = nil
    exception.mechanism?.meta?.error?.domain =
      identifier(exception.mechanism?.meta?.error?.domain) ?? "NativeError"
    cleanStack(exception.stacktrace)
  }
  event.threads = source.threads
  for thread in event.threads ?? [] {
    thread.name = nil
    cleanStack(thread.stacktrace)
  }
  event.stacktrace = source.stacktrace
  cleanStack(event.stacktrace)
  event.debugMeta = source.debugMeta
  for image in event.debugMeta ?? [] {
    image.name = fileName(image.name)
    image.codeFile = fileName(image.codeFile)
  }
  return event
}

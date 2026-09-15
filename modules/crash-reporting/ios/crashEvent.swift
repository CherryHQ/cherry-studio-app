import Foundation
import Sentry

private func cleanStack(_ stack: SentryStacktrace?) {
  for frame in stack?.frames ?? [] {
    frame.vars = nil
    frame.contextLine = nil
    frame.preContext = nil
    frame.postContext = nil
  }
}

/// Delete free-form fields in place. Error classification, stacks, and debug images stay as produced.
func sanitizeCrashEvent(_ event: Event) -> Event? {
  // React Native already reports these through its JavaScript error handler.
  if event.exceptions?.contains(where: {
    $0.type.contains("Unhandled JS Exception")
      || $0.value.contains("ExceptionsManager.reportException")
  }) == true {
    return nil
  }

  event.message = nil
  event.error = nil
  event.logger = nil
  event.serverName = nil
  event.transaction = nil
  event.extra = nil
  event.modules = nil
  event.fingerprint = nil
  event.user = nil
  event.breadcrumbs = nil
  event.request = nil
  event.tags = ["event.origin": "native", "event.platform": "ios"]

  var context: [String: [String: Any]] = [:]
  for (key, fields) in [
    "os": ["name", "version", "build", "kernel_version"],
    "device": ["family", "model", "model_id", "arch", "simulator", "memory_size"],
  ] {
    if let original = event.context?[key] {
      context[key] = original.filter { fields.contains($0.key) }
    }
  }
  event.context = context

  for exception in event.exceptions ?? [] {
    exception.value = "Error details omitted for privacy"
    exception.mechanism?.desc = nil
    exception.mechanism?.data = nil
    exception.mechanism?.helpLink = nil
    cleanStack(exception.stacktrace)
  }
  for thread in event.threads ?? [] {
    thread.name = nil
    cleanStack(thread.stacktrace)
  }
  cleanStack(event.stacktrace)
  return event
}

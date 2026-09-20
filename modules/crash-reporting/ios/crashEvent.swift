import Foundation
import Sentry

let crashBreadcrumbCodes = Set(
  (Bundle.main.object(forInfoDictionaryKey: "CherryCrashReportingBreadcrumbs") as? String ?? "")
    .split(separator: "|").map(String.init)
)
let crashBreadcrumbLimit = Bundle.main.object(forInfoDictionaryKey: "CherryCrashReportingMaxBreadcrumbs") as? Int ?? 20

func sanitizeCrashBreadcrumb(_ crumb: Breadcrumb) -> Breadcrumb? {
  guard crumb.category == "app.diagnostic", let code = crumb.message,
    crashBreadcrumbCodes.contains(code) else { return nil }
  let clean = Breadcrumb(level: .info, category: "app.diagnostic")
  clean.message = code
  clean.timestamp = crumb.timestamp
  return clean
}

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
  // JS delivery is not guaranteed (especially during startup). Keep the native fatal fallback.
  let isJavaScriptFatal = event.exceptions?.contains(where: {
    $0.type.contains("Unhandled JS Exception")
      || $0.type.contains("RCTFatalException")
      || $0.value.contains("ExceptionsManager.reportException")
  }) == true

  event.message = nil
  event.error = nil
  event.logger = nil
  event.serverName = nil
  event.transaction = nil
  event.extra = nil
  event.modules = nil
  event.fingerprint = nil
  event.user = nil
  event.breadcrumbs = event.breadcrumbs?.compactMap(sanitizeCrashBreadcrumb)
    .suffix(crashBreadcrumbLimit).map { $0 }
  event.request = nil
  event.tags = ["event.origin": "native", "event.platform": "ios"]
  if isJavaScriptFatal { event.tags?["error.kind"] = "javascript_fatal" }

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
    // RCTFatal embeds the JS message in its NSException name, not only in the reason.
    if exception.type.contains("Unhandled JS Exception")
      || exception.type.contains("RCTFatalException") {
      exception.type = "ReactNativeFatal"
    }
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

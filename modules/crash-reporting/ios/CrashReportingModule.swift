import ExpoModulesCore
import Foundation
import Sentry

// An OTA or JS reload may close this gate, but can never enable a non-production binary.
private let isCrashReportingAllowed: Bool = {
  #if DEBUG
  return false
  #else
  return Bundle.main.object(forInfoDictionaryKey: "CherryCrashReportingEnabled") as? Bool == true
  #endif
}()

public class CrashReportingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CrashReporting")
    // Consent lookup, cache cleanup, and SDK startup do disk work; keep them off the JS thread.
    AsyncFunction("configure") {
      (dsn: String, isProduction: Bool, version: String) throws -> [String: Any] in
      try CrashReportingState.shared.configure(
        dsn: dsn, isProduction: isProduction, version: version)
    }
    Function("getStatus") { CrashReportingState.shared.status() }
    AsyncFunction("setConsent") { (enabled: Bool) throws -> [String: Any] in
      try CrashReportingState.shared.setConsent(enabled)
    }
  }
}

public class CrashReportingAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  // willFinish runs before the app's didFinish callback creates the React Native root.
  public func application(
    _ application: UIApplication,
    willFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let config = Bundle.main.infoDictionary ?? [:]
    // Configuration records a fixed failure state; reporting must never prevent app startup.
    _ = try? CrashReportingState.shared.configure(
      dsn: config["CherryCrashReportingDsn"] as? String ?? "",
      isProduction: isCrashReportingAllowed,
      version: config["CherryCrashReportingConsentVersion"] as? String ?? ""
    )
    return true
  }
}

private final class CrashReportingState {
  static let shared = CrashReportingState()
  private let controlLock = NSLock()
  private let gateLock = NSLock()
  private var configured = false
  private var consentVersion = ""
  private var dsn = ""
  private var canCapture = false
  // Read by SDK callbacks under gateLock; written only while holding controlLock.
  private var granted = false
  private var active = false
  private var initialization = "not_started"

  func configure(dsn: String, isProduction: Bool, version: String) throws -> [String: Any] {
    controlLock.lock()
    var succeeded = false
    defer {
      if !succeeded {
        setGate(granted: false, active: false)
        SentrySDK.close()
        gateLock.withLock { initialization = "failed" }
        configured = false
      }
      controlLock.unlock()
    }
    self.dsn = dsn
    canCapture = isCrashReportingAllowed && isProduction && !dsn.isEmpty
    if configured {
      if version != consentVersion || (!canCapture && isActive) {
        gateLock.withLock { consentVersion = version }
        try revoke()
      } else if canCapture && isGranted && !isActive {
        start()
      }
      succeeded = true
      return status()
    }
    configured = true
    gateLock.withLock { consentVersion = version }
    let file = try consentFile()
    // Apply the default only on first use. Never overwrite an opt-out or an existing policy record.
    if !version.isEmpty && !FileManager.default.fileExists(atPath: file.path) {
      try cleanCaches()
      try version.write(to: file, atomically: true, encoding: .utf8)
    }
    if !version.isEmpty && (try? String(contentsOf: file, encoding: .utf8)) == version {
      setGate(granted: true, active: false)
    } else {
      // Nothing recorded without a grant for this disclosure may be sent, including legacy reports.
      try cleanCaches()
    }
    if isGranted && canCapture {
      start()
    }
    gateLock.withLock {
      initialization = active ? "ready" : (granted && canCapture ? "failed" : "inactive")
    }
    succeeded = true
    return status()
  }

  func setConsent(_ enabled: Bool) throws -> [String: Any] {
    controlLock.lock()
    defer { controlLock.unlock() }
    if !enabled {
      try revoke()
      return status()
    }
    if !isGranted {
      try consentVersion.write(to: consentFile(), atomically: true, encoding: .utf8)
      setGate(granted: true, active: isActive)
    }
    if canCapture && !isActive {
      start()
    }
    return status()
  }

  private func revoke() throws {
    // The gates close before SDK shutdown and disk cleanup.
    setGate(granted: false, active: false)
    SentrySDK.close()
    try "disabled".write(to: consentFile(), atomically: true, encoding: .utf8)
    try cleanCaches()
  }

  func status() -> [String: Any] {
    gateLock.withLock {
      [
        "enabled": granted, "active": active && granted,
        "consentVersion": consentVersion, "initialization": initialization,
      ]
    }
  }

  private func addBreadcrumb(_ code: String) {
    guard isActive && isGranted, crashBreadcrumbCodes.contains(code) else { return }
    let crumb = Breadcrumb(level: .info, category: "app.diagnostic")
    crumb.message = code
    SentrySDK.addBreadcrumb(crumb)
  }

  private var isGranted: Bool { gateLock.withLock { granted } }
  private var isActive: Bool { gateLock.withLock { active } }

  private func setGate(granted: Bool, active: Bool) {
    gateLock.withLock {
      self.granted = granted
      self.active = active
      initialization = active ? "starting" : "inactive"
    }
  }

  private func consentFile() throws -> URL {
    var directory = try FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
    )
    .appendingPathComponent("cherry-crash-reporting", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try directory.setResourceValues(values)
    return directory.appendingPathComponent("consent")
  }

  private var caches: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
  }

  private var cacheDirectory: URL {
    caches.appendingPathComponent("cherry-crash-reporting", isDirectory: true)
  }

  private func cleanCaches() throws {
    // io.sentry and SentryCrash hold reports from the old, unconditional initialization.
    let directories = [cacheDirectory] + ["io.sentry", "SentryCrash"].map(caches.appendingPathComponent)
    for directory in directories where FileManager.default.fileExists(atPath: directory.path) {
      try FileManager.default.removeItem(at: directory)
    }
  }

  private func start() {
    setGate(granted: true, active: true)
    SentrySDK.start { options in
      options.dsn = self.dsn
      options.environment = "production"
      options.cacheDirectoryPath = self.cacheDirectory.path
      options.sendDefaultPii = false
      options.experimental.enableLogs = false
      options.sendClientReports = false
      options.maxBreadcrumbs = UInt(crashBreadcrumbLimit)
      options.beforeBreadcrumb = { sanitizeCrashBreadcrumb($0) }
      options.enableAutoBreadcrumbTracking = false
      options.enableNetworkBreadcrumbs = false
      options.enableSwizzling = false
      options.enableAutoPerformanceTracing = false
      options.enableNetworkTracking = false
      options.enableFileIOTracing = false
      options.enableCaptureFailedRequests = false
      options.enableAutoSessionTracking = false
      options.attachScreenshot = false
      options.attachViewHierarchy = false
      options.beforeSend = { [weak self] event in
        guard let self, self.gateLock.withLock({ self.active && self.granted }) else { return nil }
        return sanitizeCrashEvent(event)
      }
    }
    if !SentrySDK.isEnabled {
      setGate(granted: true, active: false)
      gateLock.withLock { initialization = "failed" }
    } else {
      gateLock.withLock { initialization = "ready" }
    }
    addBreadcrumb("startup.native")
  }
}

import ExpoModulesCore
import Foundation
import Sentry

public class CrashReportingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CrashReporting")
    // Consent lookup, cache cleanup, and SDK startup do disk work; keep them off the JS thread.
    AsyncFunction("configure") {
      (dsn: String, isProduction: Bool, version: String) throws -> [String: Bool] in
      try CrashReportingState.shared.configure(
        dsn: dsn, isProduction: isProduction, version: version)
    }
    Function("getStatus") { CrashReportingState.shared.status() }
    AsyncFunction("setConsent") { (enabled: Bool) throws -> [String: Bool] in
      try CrashReportingState.shared.setConsent(enabled)
    }
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

  func configure(dsn: String, isProduction: Bool, version: String) throws -> [String: Bool] {
    controlLock.lock()
    defer { controlLock.unlock() }
    self.dsn = dsn
    canCapture = isProduction && !dsn.isEmpty
    if configured {
      if version != consentVersion || (!canCapture && isActive) {
        consentVersion = version
        try revoke()
      }
      return status()
    }
    configured = true
    consentVersion = version
    if !FileManager.default.fileExists(atPath: try consentFile().path) {
      try cleanCaches()
      try consentVersion.write(to: consentFile(), atomically: true, encoding: .utf8)
    }
    if (try? String(contentsOf: consentFile(), encoding: .utf8)) == version {
      setGate(granted: true, active: false)
    } else {
      // Nothing recorded without a grant for this disclosure may be sent, including legacy reports.
      try cleanCaches()
    }
    if isGranted && canCapture {
      start()
    }
    return status()
  }

  func setConsent(_ enabled: Bool) throws -> [String: Bool] {
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

  func status() -> [String: Bool] {
    gateLock.withLock { ["enabled": granted, "active": active && granted] }
  }

  private var isGranted: Bool { gateLock.withLock { granted } }
  private var isActive: Bool { gateLock.withLock { active } }

  private func setGate(granted: Bool, active: Bool) {
    gateLock.withLock {
      self.granted = granted
      self.active = active
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
      options.maxBreadcrumbs = 0
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
    }
  }
}

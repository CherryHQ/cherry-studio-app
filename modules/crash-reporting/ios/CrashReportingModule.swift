import ExpoModulesCore
import Foundation
import Sentry

public class CrashReportingModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CrashReporting")
    Function("configure") {
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
  private let lock = NSLock()
  private var consentVersion = ""
  private var consentToken = ""
  private var activeToken = ""
  private var configured = false
  private var session: URLSession?

  func configure(dsn: String, isProduction: Bool, version: String) throws -> [String: Bool] {
    controlLock.lock()
    defer { controlLock.unlock() }
    let canCapture = isProduction && !dsn.isEmpty
    if configured {
      if version != consentVersion || (!canCapture && status()["active"] == true) {
        consentVersion = version
        try revoke()
      }
      return status()
    }
    configured = true
    consentVersion = version
    let saved =
      (try? String(contentsOf: consentFile(), encoding: .utf8))?.components(
        separatedBy: "\n") ?? []
    if saved.count == 2, saved[0] == version, UUID(uuidString: saved[1]) != nil {
      lock.withLock { consentToken = saved[1] }
    }
    try cleanCaches(keeping: canCapture ? consentToken : "")
    if canCapture && !consentToken.isEmpty {
      start(dsn: dsn, token: consentToken)
    }
    return status()
  }

  func setConsent(_ enabled: Bool) throws -> [String: Bool] {
    controlLock.lock()
    defer { controlLock.unlock() }
    if enabled {
      if lock.withLock({ consentToken.isEmpty }) {
        let token = UUID().uuidString
        try "\(consentVersion)\n\(token)".write(
          to: consentFile(), atomically: true, encoding: .utf8)
        lock.withLock { consentToken = token }
      }
    } else {
      try revoke()
    }
    // Enabling never restarts the SDK in this process. Old callbacks cannot inherit new consent.
    return status()
  }

  private func revoke() throws {
    lock.withLock {
      consentToken = ""
      activeToken = ""
    }
    // Invalidating the dedicated session also cancels requests already queued by Sentry.
    session?.invalidateAndCancel()
    session = nil
    SentrySDK.close()
    let file = try consentFile()
    if FileManager.default.fileExists(atPath: file.path) {
      try FileManager.default.removeItem(at: file)
    }
    try cleanCaches(keeping: "")
  }

  func status() -> [String: Bool] {
    lock.withLock {
      [
        "enabled": !consentToken.isEmpty,
        "active": !activeToken.isEmpty && activeToken == consentToken,
      ]
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

  private func cleanCaches(keeping token: String) throws {
    let root = caches.appendingPathComponent("cherry-crash-reporting", isDirectory: true)
    if FileManager.default.fileExists(atPath: root.path) {
      for item in try FileManager.default.contentsOfDirectory(
        at: root, includingPropertiesForKeys: nil) where item.lastPathComponent != token
      {
        try FileManager.default.removeItem(at: item)
      }
    }
    // Reports from the old, unconditional initialization have no recorded consent.
    for name in ["io.sentry", "SentryCrash"] {
      let legacy = caches.appendingPathComponent(name)
      if FileManager.default.fileExists(atPath: legacy.path) {
        try FileManager.default.removeItem(at: legacy)
      }
    }
  }

  private func start(dsn: String, token: String) {
    let transportSession = URLSession(configuration: .ephemeral)
    session = transportSession
    lock.withLock { activeToken = token }
    SentrySDK.start { options in
      options.dsn = dsn
      options.environment = "production"
      options.cacheDirectoryPath =
        self.caches.appendingPathComponent("cherry-crash-reporting/\(token)").path
      options.urlSession = transportSession
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
        guard let self,
          self.lock.withLock({ self.activeToken == token && self.consentToken == token })
        else { return nil }
        return sanitizeCrashEvent(event)
      }
    }
    if !SentrySDK.isEnabled {
      lock.withLock { activeToken = "" }
      transportSession.invalidateAndCancel()
      session = nil
    }
  }
}

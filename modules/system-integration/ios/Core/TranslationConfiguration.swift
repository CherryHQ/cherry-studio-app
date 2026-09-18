import Foundation
import Security

struct TranslationFailure: Error, LocalizedError {
  let code: String
  var errorDescription: String? { CherryStrings()[code] }
}

struct TranslationConfiguration {
  let revision: String
  let modelName: String
  let providerName: String
  let endpoint: URL
  let wireModelId: String
  let targetLanguage: String
  let instructionTemplate: String
  let apiKey: String
}

enum SystemIntegrationFiles {
  static func root() throws -> URL {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "CherrySystemIntegrationGroup") as? String,
          let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      throw TranslationFailure(code: "configurationStale")
    }
    var root = container.appendingPathComponent("SystemIntegration", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try root.setResourceValues(values)
    return root
  }

  static func write(_ value: Any, to url: URL) throws {
    let bytes = try JSONSerialization.data(withJSONObject: value)
    try bytes.write(to: url, options: [.atomic, .completeFileProtection])
  }

  // A share's 131,072 UTF-16 units can occupy up to six JSON bytes per unit.
  static func read(_ url: URL, limit: Int = 1_048_576) throws -> Any {
    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard size > 0, size <= limit else { throw TranslationFailure(code: "configurationStale") }
    return try JSONSerialization.jsonObject(with: Data(contentsOf: url))
  }
}

/** The app is the sole writer. Extensions read a complete revision or fail closed. */
enum TranslationConfigurationStore {
  private static let lock = NSRecursiveLock()
  private static let service = "CherryTemporaryTranslation"

  static func invalidate() throws {
    lock.lock(); defer { lock.unlock() }
    let file = try configurationFile()
    if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
    let status = SecItemDelete(try keychainQuery() as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw TranslationFailure(code: "credentialsUnavailable")
    }
  }

  static func publish(_ values: [String: Any], apiKey: String) throws {
    lock.lock(); defer { lock.unlock() }
    _ = try parse(values, apiKey: apiKey)
    guard let revision = values["revision"] as? String else { throw TranslationFailure(code: "configurationStale") }
    try invalidate()
    var query = try keychainQuery()
    query[kSecAttrAccount as String] = revision
    query[kSecValueData as String] = Data(apiKey.utf8)
    query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    guard SecItemAdd(query as CFDictionary, nil) == errSecSuccess else {
      throw TranslationFailure(code: "credentialsUnavailable")
    }
    do { try SystemIntegrationFiles.write(values, to: configurationFile()) }
    catch { try? invalidate(); throw TranslationFailure(code: "configurationStale") }
  }

  static func publishUnavailable(_ values: [String: Any]) throws {
    lock.lock(); defer { lock.unlock() }
    try invalidate()
    var metadata = values
    metadata["unavailable"] = true
    try SystemIntegrationFiles.write(metadata, to: configurationFile())
  }

  static func displayValues() -> [String: Any]? {
    lock.lock(); defer { lock.unlock() }
    guard let file = try? configurationFile() else { return nil }
    return (try? SystemIntegrationFiles.read(file, limit: 65_536)) as? [String: Any]
  }

  static func read() throws -> TranslationConfiguration {
    lock.lock(); defer { lock.unlock() }
    guard let values = displayValues() else { throw TranslationFailure(code: "configurationStale") }
    if values["unavailable"] as? Bool == true {
      throw TranslationFailure(code: values["reason"] as? String ?? "configurationStale")
    }
    guard let revision = values["revision"] as? String else { throw TranslationFailure(code: "configurationStale") }
    var query = try keychainQuery()
    query[kSecAttrAccount as String] = revision
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
          let data = result as? Data, let key = String(data: data, encoding: .utf8) else {
      throw TranslationFailure(code: "credentialsUnavailable")
    }
    return try parse(values, apiKey: key)
  }

  static func revision() -> String? { displayValues()?["revision"] as? String }

  private static func configurationFile() throws -> URL {
    try SystemIntegrationFiles.root().appendingPathComponent("translation.json")
  }

  private static func keychainQuery() throws -> [String: Any] {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "CherrySystemIntegrationKeychainGroup") as? String,
          !group.isEmpty, !group.contains("$(") else { throw TranslationFailure(code: "configurationStale") }
    return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrAccessGroup as String: group]
  }

  private static func parse(_ values: [String: Any], apiKey: String) throws -> TranslationConfiguration {
    guard values["version"] as? Int == 1,
          let revision = values["revision"] as? String,
          let modelName = values["modelName"] as? String,
          let providerName = values["providerName"] as? String,
          let address = values["endpoint"] as? String, let endpoint = URL(string: address),
          endpoint.scheme == "https", endpoint.host != nil, endpoint.user == nil, endpoint.password == nil,
          endpoint.query == nil, endpoint.fragment == nil,
          let wireModelId = values["wireModelId"] as? String,
          let targetLanguage = values["targetLanguage"] as? String,
          let template = values["instructionTemplate"] as? String,
          !apiKey.isEmpty, !apiKey.contains("\r"), !apiKey.contains("\n") else {
      throw TranslationFailure(code: "configurationStale")
    }
    return TranslationConfiguration(revision: revision, modelName: modelName, providerName: providerName,
      endpoint: endpoint, wireModelId: wireModelId, targetLanguage: targetLanguage,
      instructionTemplate: template, apiKey: apiKey)
  }
}

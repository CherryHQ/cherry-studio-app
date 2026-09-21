import Foundation

struct SystemEntryFailure: Error, LocalizedError {
  let code: String
  var errorDescription: String? { CherryStrings()[code] }
}

enum SystemIntegrationFiles {
  static func root() throws -> URL {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "CherrySystemIntegrationGroup") as? String,
          let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else {
      throw SystemEntryFailure(code: "failed")
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
    guard size > 0, size <= limit else { throw SystemEntryFailure(code: "failed") }
    return try JSONSerialization.jsonObject(with: Data(contentsOf: url))
  }
}

struct SharedAttachment {
  let url: URL
  let name: String
  let mediaType: String
}

enum SystemEntryStore {
  static let pendingNotification = Notification.Name("CherrySystemEntryPending")
  static let cancelledNotification = Notification.Name("CherrySystemIntentCancelled")
  private static let lock = NSRecursiveLock()
  private static var claimed = Set<String>()
  private static var memory: [[String: Any]] = []
  private static var replies: [String: [String: Any]] = [:]

  static func enqueue(kind: String, agentId: String?, text: String? = nil, replyExpected: Bool = false) -> String {
    lock.lock(); defer { lock.unlock() }
    let id = UUID().uuidString
    var entry: [String: Any] = ["version": 1, "id": id, "createdAt": Date().timeIntervalSince1970 * 1000, "kind": kind]
    if let agentId { entry["agentId"] = agentId }
    if let text { entry["text"] = text }
    if replyExpected { entry["replyExpected"] = true }
    memory.append(entry)
    NotificationCenter.default.post(name: pendingNotification, object: nil)
    return id
  }

  static func stageShare(text: String, attachments: [SharedAttachment]) throws {
    guard text.utf16.count <= 131_072, attachments.count <= 10,
          !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty else {
      throw SystemEntryFailure(code: "shareFailed")
    }
    let id = UUID().uuidString
    let directory = try shares().appendingPathComponent(id, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])
    do {
      var total = 0
      var files: [[String: Any]] = []
      for attachment in attachments {
        try Task.checkCancellation()
        let size = try attachment.url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        total += size
        guard size <= 25 * 1024 * 1024, total <= 50 * 1024 * 1024 else { throw SystemEntryFailure(code: "shareFailed") }
        let destination = directory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.copyItem(at: attachment.url, to: destination)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: destination.path)
        files.append(["uri": destination.absoluteString, "name": String(attachment.name.prefix(255)),
                      "mediaType": attachment.mediaType, "size": size])
      }
      try Task.checkCancellation()
      try SystemIntegrationFiles.write(["version": 1, "id": id, "createdAt": Date().timeIntervalSince1970 * 1000,
        "kind": "share.receive", "text": text, "files": files], to: directory.appendingPathComponent("entry.json"))
    } catch { try? FileManager.default.removeItem(at: directory); throw error }
  }

  static func claimNext() throws -> [String: Any]? {
    lock.lock(); defer { lock.unlock() }
    let now = Date().timeIntervalSince1970 * 1000
    memory.removeAll { now - ($0["createdAt"] as? Double ?? 0) > 120_000 }
    if let entry = memory.first(where: { !claimed.contains($0["id"] as? String ?? "") }), let id = entry["id"] as? String {
      claimed.insert(id)
      return entry
    }
    let directories = try FileManager.default.contentsOfDirectory(at: shares(), includingPropertiesForKeys: [.creationDateKey])
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
    for directory in directories {
      let id = directory.lastPathComponent
      guard UUID(uuidString: id) != nil, !claimed.contains(id) else { continue }
      guard let entry = try? SystemIntegrationFiles.read(directory.appendingPathComponent("entry.json")) as? [String: Any],
            entry["version"] as? Int == 1, entry["id"] as? String == id, entry["kind"] as? String == "share.receive",
            let created = entry["createdAt"] as? Double, now - created <= 86_400_000, created <= now + 60_000,
            let files = entry["files"] as? [[String: Any]], files.count <= 10,
            files.allSatisfy({ file in
              guard let address = file["uri"] as? String, let url = URL(string: address), url.isFileURL else { return false }
              return url.resolvingSymlinksInPath().deletingLastPathComponent() == directory.resolvingSymlinksInPath()
                && FileManager.default.fileExists(atPath: url.path)
            }) else {
        // An extension can be killed before publishing its manifest. Do not delete an active writer's directory.
        let created = (try? directory.resourceValues(forKeys: [.creationDateKey]))?.creationDate ?? .distantPast
        if Date().timeIntervalSince(created) > 86_400 { try? FileManager.default.removeItem(at: directory) }
        continue
      }
      claimed.insert(id)
      return entry
    }
    return nil
  }

  static func release(_ id: String) { lock.lock(); defer { lock.unlock() }; claimed.remove(id) }

  static func complete(_ id: String) throws {
    lock.lock(); defer { lock.unlock() }
    guard UUID(uuidString: id) != nil else { throw SystemEntryFailure(code: "failed") }
    claimed.remove(id)
    memory.removeAll { $0["id"] as? String == id }
    let directory = try shares().appendingPathComponent(id)
    if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
  }

  static func finishIntent(_ id: String, result: [String: Any]) {
    lock.lock(); defer { lock.unlock() }
    // Replies can only address an outstanding native-created ask, never an imported share.
    guard memory.contains(where: { $0["id"] as? String == id && $0["replyExpected"] as? Bool == true }) else { return }
    replies[id] = result
  }

  static func takeReply(_ id: String) -> [String: Any]? {
    lock.lock(); defer { lock.unlock() }; return replies.removeValue(forKey: id)
  }

  static func cancelIntent(_ id: String) {
    lock.lock()
    replies.removeValue(forKey: id)
    memory.removeAll { $0["id"] as? String == id }
    claimed.remove(id)
    lock.unlock()
    NotificationCenter.default.post(name: cancelledNotification, object: nil, userInfo: ["id": id])
  }

  private static func shares() throws -> URL {
    let directory = try SystemIntegrationFiles.root().appendingPathComponent("shares", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete])
    return directory
  }
}

/** Public surface imported by App Intents compiled into the application target. */
public enum CherrySystemIntents {
  public static func openChat(agentId: String?) { _ = SystemEntryStore.enqueue(kind: "chat.open", agentId: agentId) }

  public static func ask(_ text: String, agentId: String?) async throws -> String {
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 131_072 else {
      throw SystemEntryFailure(code: "invalidInput")
    }
    let id = SystemEntryStore.enqueue(kind: "chat.ask", agentId: agentId, text: text, replyExpected: true)
    defer { SystemEntryStore.cancelIntent(id) }
    let deadline = Date().addingTimeInterval(55)
    while Date() < deadline {
      try Task.checkCancellation()
      if let result = SystemEntryStore.takeReply(id) {
        guard result["status"] as? String == "succeeded", let response = result["text"] as? String else {
          throw SystemEntryFailure(code: "failed")
        }
        return response
      }
      try await Task.sleep(nanoseconds: 100_000_000)
    }
    throw SystemEntryFailure(code: "timedOut")
  }

  public static func agents() -> [[String: String]] {
    guard let root = try? SystemIntegrationFiles.root() else { return [] }
    return (try? SystemIntegrationFiles.read(root.appendingPathComponent("agents.json"))) as? [[String: String]] ?? []
  }
}

import CryptoKit
import Darwin
import ExpoModulesCore
import Foundation

private let backupProcessId = UUID().uuidString.lowercased()
private let controlLock = NSLock()

public class BackupStorageModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BackupStorage")
    Function("processId") { backupProcessId }
    Function("readControl") { (documentUri: String) throws -> String? in
      controlLock.lock()
      defer { controlLock.unlock() }
      let file = try self.controlFile(documentUri)
      guard FileManager.default.fileExists(atPath: file.path) else { return nil }
      let data = try Data(contentsOf: file)
      guard data.count <= 16384, let value = String(data: data, encoding: .utf8) else {
        throw self.failure("Invalid storage control record")
      }
      return value
    }
    Function("writeControl") { (documentUri: String, value: String) throws in
      controlLock.lock()
      defer { controlLock.unlock() }
      guard let bytes = value.data(using: .utf8), bytes.count <= 16384 else {
        throw self.failure("Invalid storage control record")
      }
      let file = try self.controlFile(documentUri)
      let parent = file.deletingLastPathComponent()
      try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
      let temporary = parent.appendingPathComponent("state.tmp")
      try bytes.write(to: temporary, options: .completeFileProtectionUntilFirstUserAuthentication)
      try self.flush(temporary)
      guard rename(temporary.path, file.path) == 0 else {
        throw self.failure("Could not replace storage control record")
      }
      try self.flush(parent)
      try self.flush(parent.deletingLastPathComponent())
    }
    AsyncFunction("hashFile") { (uri: String) throws -> String in
      let file = try self.privateFile(uri)
      let handle = try FileHandle(forReadingFrom: file)
      defer { try? handle.close() }
      var digest = SHA256()
      while let chunk = try handle.read(upToCount: 262144), !chunk.isEmpty {
        digest.update(data: chunk)
      }
      return digest.finalize().map { String(format: "%02x", $0) }.joined()
    }
    AsyncFunction("sealDirectory") { (uri: String) throws in
      let root = try self.privateFile(uri)
      try self.seal(root)
      try self.flush(root.deletingLastPathComponent())
    }
  }

  private func controlFile(_ documentUri: String) throws -> URL {
    try privateFile(documentUri).appendingPathComponent("storage-control/state.json")
  }

  private func privateFile(_ uri: String) throws -> URL {
    guard let file = URL(string: uri), file.isFileURL else {
      throw failure("Expected a private file URL")
    }
    let resolved = file.standardizedFileURL.resolvingSymlinksInPath()
    let home = URL(fileURLWithPath: NSHomeDirectory()).resolvingSymlinksInPath().path + "/"
    guard resolved.path.hasPrefix(home) else {
      throw failure("Path is outside private storage or contains a symlink")
    }
    return resolved
  }

  private func seal(_ file: URL) throws {
    let values = try file.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey, .isRegularFileKey])
    guard values.isSymbolicLink != true else { throw failure("Symlinks are not supported") }
    if values.isDirectory == true {
      for child in try FileManager.default.contentsOfDirectory(at: file, includingPropertiesForKeys: nil) {
        try seal(child)
      }
    } else if values.isRegularFile != true {
      throw failure("Unsupported storage entry")
    }
    try flush(file)
  }

  private func flush(_ file: URL) throws {
    let descriptor = open(file.path, O_RDONLY)
    guard descriptor >= 0 else { throw failure("Could not open storage for synchronization") }
    defer { close(descriptor) }
    guard fsync(descriptor) == 0 else { throw failure("Could not synchronize storage") }
  }

  private func failure(_ message: String) -> NSError {
    NSError(domain: "BackupStorage", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }
}

import CryptoKit
import ExpoModulesCore
import Foundation

private let secretSuffix = "GvI6I5ZrEHcGOWjO5AKhJKGmnwwGfM62XKpWqkjhvzRU2NZIinM77aTGIqhqys0g"

public class DiagnosticsModule: Module {
  private let uploadLock = NSLock()
  private var upload: DiagnosticUpload?

  private func cancelUpload() {
    uploadLock.lock()
    let transfer = upload
    uploadLock.unlock()
    transfer?.cancel()
  }

  public func definition() -> ModuleDefinition {
    Name("CherryDiagnostics")

    Function("identifyFile") { (uri: URL) -> [String: Any] in
      let attributes = try FileManager.default.attributesOfItem(atPath: uri.path)
      guard let size = attributes[.size] as? NSNumber,
        let date = attributes[.modificationDate] as? Date,
        let device = attributes[.systemNumber] as? NSNumber,
        let inode = attributes[.systemFileNumber] as? NSNumber,
        attributes[.type] as? FileAttributeType == .typeRegular
      else {
        throw NSError(domain: "CherryDiagnostics", code: 3)
      }
      return [
        "size": size.doubleValue, "modifiedAt": date.timeIntervalSince1970 * 1000,
        "fileKey": "\(device.stringValue):\(inode.stringValue)",
      ]
    }

    Function("cancelOperations") { self.cancelUpload() }

    OnDestroy { self.cancelUpload() }

    Function("isUploadConfigured") {
      let secret = Bundle.main.object(forInfoDictionaryKey: "CherryAIClientSecret") as? String
      return secret?.isEmpty == false
    }

    AsyncFunction("upload") {
      (uri: URL, name: String, description: String, headers: [String: String], promise: Promise) in
      let upload = DiagnosticUpload(uri: uri, promise: promise)
      self.uploadLock.lock()
      self.upload = upload
      self.uploadLock.unlock()
      do {
        try upload.start(uri: uri, name: name, description: description, headers: headers)
      } catch { promise.reject("ERR_UPLOAD_PREPARATION", "Unable to prepare diagnostic upload") }
    }

    AsyncFunction("sign") { (value: String) -> String in
      guard
        let secret = Bundle.main.object(forInfoDictionaryKey: "CherryAIClientSecret") as? String,
        !secret.isEmpty
      else {
        throw NSError(
          domain: "CherryDiagnostics", code: 1,
          userInfo: [NSLocalizedDescriptionKey: "CherryAI client secret is not configured"])
      }
      let key = SymmetricKey(data: Data("\(secret).\(secretSuffix)".utf8))
      return HMAC<SHA256>.authenticationCode(for: Data(value.utf8), using: key)
        .map { String(format: "%02x", $0) }.joined()
    }
  }
}

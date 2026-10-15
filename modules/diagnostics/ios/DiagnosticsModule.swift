import CryptoKit
import CoreMotion
import ExpoModulesCore
import Foundation
import UIKit

private let secretSuffix = "GvI6I5ZrEHcGOWjO5AKhJKGmnwwGfM62XKpWqkjhvzRU2NZIinM77aTGIqhqys0g"

public class DiagnosticsModule: Module {
  private let uploadLock = NSLock()
  private var upload: DiagnosticUpload?
  private let motion = CMMotionManager()
  private var observingMotion = false

  private func startMotion() {
    guard observingMotion, motion.isAccelerometerAvailable, !motion.isAccelerometerActive else { return }
    motion.accelerometerUpdateInterval = 0.05
    motion.startAccelerometerUpdates(to: .main) { [weak self] data, _ in
      guard let self, let data, UIApplication.shared.applicationState == .active else { return }
      self.sendEvent("onAcceleration", [
        "x": data.acceleration.x, "y": data.acceleration.y, "z": data.acceleration.z,
        "timestamp": data.timestamp * 1000,
      ])
    }
  }

  private func cancelUpload() {
    uploadLock.lock()
    let transfer = upload
    uploadLock.unlock()
    transfer?.cancel()
  }

  public func definition() -> ModuleDefinition {
    Name("CherryDiagnostics")
    Constants(["supportsShakeFeedback": true])
    Events("onAcceleration")
    OnStartObserving("onAcceleration") {
      DispatchQueue.main.async {
        self.observingMotion = true
        if UIApplication.shared.applicationState == .active { self.startMotion() }
      }
    }
    OnStopObserving("onAcceleration") {
      DispatchQueue.main.async {
        self.observingMotion = false
        self.motion.stopAccelerometerUpdates()
      }
    }
    OnAppBecomesActive { self.startMotion() }
    OnAppEntersBackground { self.motion.stopAccelerometerUpdates() }

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

    OnDestroy {
      self.cancelUpload()
      self.motion.stopAccelerometerUpdates()
    }

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

    AsyncFunction("sha256") { (uri: URL) -> String in
      let file = try FileHandle(forReadingFrom: uri)
      defer { try? file.close() }
      var hash = SHA256()
      while let bytes = try file.read(upToCount: 64 * 1024), !bytes.isEmpty {
        hash.update(data: bytes)
      }
      return hash.finalize().map { String(format: "%02x", $0) }.joined()
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

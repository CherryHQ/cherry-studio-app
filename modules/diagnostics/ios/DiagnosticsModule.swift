import CryptoKit
import ExpoModulesCore
import MetricKit
import UIKit

private let secretSuffix = "GvI6I5ZrEHcGOWjO5AKhJKGmnwwGfM62XKpWqkjhvzRU2NZIinM77aTGIqhqys0g"

private final class DiagnosticCapture: NSObject, MXMetricManagerSubscriber {
  static let shared = DiagnosticCapture()
  private var directory: URL?

  func start(_ uri: String) {
    guard directory == nil, let url = URL(string: uri), url.isFileURL else { return }
    directory = url
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    MXMetricManager.shared.add(self)
  }

  // MetricKit delivers OS-owned crash/hang reports after the event. Only their
  // inventory is exported; the original reports remain local, as on desktop.
  func didReceive(_ payloads: [MXDiagnosticPayload]) {
    guard let directory else { return }
    for payload in payloads {
      let target = directory.appendingPathComponent("\(UUID().uuidString).json")
      try? payload.jsonRepresentation().write(to: target, options: .atomic)
      try? FileManager.default.setAttributes(
        [.modificationDate: payload.timeStampEnd], ofItemAtPath: target.path)
    }
  }
}

private final class SaveDelegate: NSObject, UIDocumentPickerDelegate,
  UIAdaptivePresentationControllerDelegate
{
  private var completion: ((String?) -> Void)?
  init(_ completion: @escaping (String?) -> Void) { self.completion = completion }
  private func finish(_ uri: String?) {
    let callback = completion
    completion = nil
    callback?(uri)
  }
  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL])
  {
    finish(urls.first?.absoluteString)
  }
  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finish(nil) }
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish(nil)
  }
  func cancel() { finish(nil) }
}

public class DiagnosticsModule: Module {
  private var saveDelegate: SaveDelegate?
  private weak var savePicker: UIDocumentPickerViewController?
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

    Function("startCrashCapture") { (directory: String) in DiagnosticCapture.shared.start(directory)
    }

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

    Function("cancelOperations") {
      self.cancelUpload()
      DispatchQueue.main.async {
        self.savePicker?.dismiss(animated: false)
        self.saveDelegate?.cancel()
      }
    }

    OnDestroy { self.cancelUpload() }

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

    AsyncFunction("saveFile") { (uri: URL, name: String, promise: Promise) in
      guard self.saveDelegate == nil else {
        promise.reject("ERR_BUSY", "A document export is already open")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_NO_ACTIVITY", "No active screen for document export")
        return
      }
      let delegate = SaveDelegate { [weak self] destination in
        self?.saveDelegate = nil
        promise.resolve(destination)
      }
      self.saveDelegate = delegate
      // The staging file already has the suggested name. The picker copies it
      // to the user's Files location and reports completion through its delegate.
      let picker = UIDocumentPickerViewController(forExporting: [uri], asCopy: true)
      self.savePicker = picker
      picker.delegate = delegate
      picker.presentationController?.delegate = delegate
      presenter.present(picker, animated: true)
    }.runOnQueue(.main)
  }
}

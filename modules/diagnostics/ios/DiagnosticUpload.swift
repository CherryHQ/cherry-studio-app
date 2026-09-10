import CryptoKit
import ExpoModulesCore
import Foundation

// A foreground, file-backed transfer. No background upload or automatic retry.
final class DiagnosticUpload: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate,
  @unchecked Sendable
{
  private let promise: Promise
  private let multipart: URL
  private var responseBody = Data()
  private var status = 0
  private var invalidResponse = false
  private var session: URLSession?
  private let lock = NSLock()
  private var cancelled = false
  private var task: URLSessionUploadTask?

  init(uri: URL, promise: Promise) {
    self.promise = promise
    multipart = uri.deletingLastPathComponent().appendingPathComponent(
      "multipart-\(UUID().uuidString).tmp")
    super.init()
  }

  func cancel() {
    lock.lock()
    cancelled = true
    task?.cancel()
    lock.unlock()
  }

  private func checkCancellation() throws {
    lock.lock()
    defer { lock.unlock() }
    if cancelled { throw CancellationError() }
  }

  func start(uri: URL, name: String, description: String, headers: [String: String]) throws {
    let boundary = "CherryDiagnostic\(UUID().uuidString)"
    let safeName = name.replacingOccurrences(of: "\"", with: "_").replacingOccurrences(
      of: "\r", with: "_"
    ).replacingOccurrences(of: "\n", with: "_")
    do {
      FileManager.default.createFile(atPath: multipart.path, contents: nil)
      let writer = try FileHandle(forWritingTo: multipart)
      defer { try? writer.close() }
      try writer.write(
        contentsOf: Data(
          ("--\(boundary)\r\nContent-Disposition: form-data; name=\"description\"\r\n\r\n\(description)\r\n"
            + "--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(safeName)\"\r\nContent-Type: application/zip\r\n\r\n")
            .utf8))
      let reader = try FileHandle(forReadingFrom: uri)
      defer { try? reader.close() }
      var hash = SHA256()
      var size = 0
      while let bytes = try reader.read(upToCount: 64 * 1024), !bytes.isEmpty {
        try checkCancellation()
        hash.update(data: bytes)
        size += bytes.count
        try writer.write(contentsOf: bytes)
      }
      let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
      guard digest == headers["X-File-SHA256"], String(size) == headers["X-File-Size"] else {
        throw NSError(
          domain: "CherryDiagnostics", code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Diagnostic archive changed"])
      }
      try writer.write(contentsOf: Data("\r\n--\(boundary)--\r\n".utf8))
    } catch {
      try? FileManager.default.removeItem(at: multipart)
      throw error
    }
    var request = URLRequest(url: URL(string: "https://api.cherry-ai.com/diagnostics")!)
    request.httpMethod = "POST"
    request.allHTTPHeaderFields = headers
    request.setValue(
      "multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 15 * 60
    configuration.timeoutIntervalForResource = 15 * 60
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    self.session = session
    lock.lock()
    let task = session.uploadTask(with: request, fromFile: multipart)
    self.task = task
    if cancelled { task.cancel() } else { task.resume() }
    lock.unlock()
  }

  func urlSession(
    _ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }

  func urlSession(
    _ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if status != 400 && !(200..<300).contains(status) {
      completionHandler(.cancel)
      return
    }
    if let header = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Length") {
      let text = header.trimmingCharacters(in: .whitespacesAndNewlines)
      if text.isEmpty || text.contains(where: { !$0.isASCII || !$0.isNumber }) || Int(text) == nil
        || Int(text)! > 64 * 1024
      {
        invalidResponse = true
        completionHandler(.cancel)
        return
      }
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    if responseBody.count + data.count > 64 * 1024 {
      invalidResponse = true
      dataTask.cancel()
    } else {
      responseBody.append(data)
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    let body = String(data: responseBody, encoding: .utf8)
    promise.resolve(
      [
        "status": status, "body": body ?? "",
        "invalidResponse": invalidResponse || body == nil || error != nil,
      ] as [String: Any])
    try? FileManager.default.removeItem(at: multipart)
    session.finishTasksAndInvalidate()
    self.session = nil
  }
}

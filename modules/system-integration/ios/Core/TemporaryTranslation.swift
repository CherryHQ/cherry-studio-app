import Foundation

enum TemporaryTranslation {
  static func isLanguage(_ value: String) -> Bool {
    value.range(of: "^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,3}$", options: .regularExpression) != nil
  }

  static func translate(_ text: String, targetLanguage: String?) async throws -> String {
    guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw TranslationFailure(code: "invalidInput") }
    guard text.utf16.count <= 16_000 else { throw TranslationFailure(code: "inputTooLarge") }
    let configuration = try TranslationConfigurationStore.read()
    let language = targetLanguage ?? configuration.targetLanguage
    guard isLanguage(language) else { throw TranslationFailure(code: "invalidInput") }
    try Task.checkCancellation()
    let body: [String: Any] = [
      "model": configuration.wireModelId, "stream": false,
      "messages": [
        ["role": "system", "content": configuration.instructionTemplate.replacingOccurrences(of: "{language}", with: language)],
        ["role": "user", "content": text]
      ]
    ]
    var request = URLRequest(url: configuration.endpoint, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 45)
    request.httpMethod = "POST"
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(configuration.apiKey)", forHTTPHeaderField: "Authorization")
    request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
    request.setValue("CherryStudioMobile/1.0", forHTTPHeaderField: "User-Agent")
    let call = TemporaryTranslationRequest()
    return try await withThrowingTaskGroup(of: String.self) { group in
      group.addTask { try await call.perform(request) }
      group.addTask {
        try await Task.sleep(nanoseconds: 45_000_000_000)
        throw TranslationFailure(code: "timedOut")
      }
      group.addTask {
        while !Task.isCancelled {
          try await Task.sleep(nanoseconds: 400_000_000)
          if TranslationConfigurationStore.revision() != configuration.revision {
            throw TranslationFailure(code: "configurationStale")
          }
        }
        throw CancellationError()
      }
      defer { group.cancelAll(); call.cancel() }
      guard let result = try await group.next() else { throw TranslationFailure(code: "failed") }
      guard TranslationConfigurationStore.revision() == configuration.revision else { throw TranslationFailure(code: "configurationStale") }
      return result
    }
  }
}

/** The delegate bounds response memory and rejects redirects before credentials can cross hosts. */
private final class TemporaryTranslationRequest: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  private let lock = NSLock()
  private var continuation: CheckedContinuation<String, Error>?
  private var session: URLSession?
  private var task: URLSessionDataTask?
  private var bytes = Data()
  private var cancelled = false

  func perform(_ request: URLRequest) async throws -> String {
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        lock.lock()
        if cancelled || Task.isCancelled {
          lock.unlock()
          continuation.resume(throwing: CancellationError())
          return
        }
        self.continuation = continuation
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.urlCredentialStorage = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 45
        configuration.timeoutIntervalForResource = 45
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        self.session = session
        let task = session.dataTask(with: request)
        self.task = task
        lock.unlock()
        task.resume()
      }
    } onCancel: { self.cancel() }
  }

  func cancel() {
    lock.lock()
    cancelled = true
    lock.unlock()
    finish(.failure(CancellationError()))
  }

  func urlSession(_ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
    finish(.failure(TranslationFailure(code: "failed")))
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200, response.expectedContentLength <= 524_288 else {
      completionHandler(.cancel)
      let code: String
      switch status {
      case 401, 403: code = "authenticationFailed"
      case 429: code = "rateLimited"
      case 408, 504: code = "timedOut"
      case 200: code = "invalidResult"
      default: code = "failed"
      }
      finish(.failure(TranslationFailure(code: code)))
      return
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    lock.lock()
    let canAppend = continuation != nil && bytes.count + data.count <= 524_288
    if canAppend { bytes.append(data) }
    lock.unlock()
    if !canAppend { finish(.failure(TranslationFailure(code: "invalidResult"))) }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if let error {
      let code = (error as? URLError)?.code == .timedOut ? "timedOut" : "networkUnavailable"
      finish(.failure(TranslationFailure(code: code)))
      return
    }
    lock.lock()
    let data = bytes
    lock.unlock()
    do {
      guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let choices = object["choices"] as? [[String: Any]], let choice = choices.first,
            choice["finish_reason"] as? String == "stop",
            let message = choice["message"] as? [String: Any], let text = message["content"] as? String,
            !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 64_000,
            (message["tool_calls"] as? [Any])?.isEmpty != false,
            (message["refusal"] as? String)?.isEmpty != false else {
        throw TranslationFailure(code: "invalidResult")
      }
      finish(.success(text))
    } catch { finish(.failure(TranslationFailure(code: "invalidResult"))) }
  }

  private func finish(_ result: Result<String, Error>) {
    lock.lock()
    let continuation = self.continuation
    self.continuation = nil
    let session = self.session
    self.session = nil
    self.task = nil
    bytes.removeAll(keepingCapacity: false)
    lock.unlock()
    session?.invalidateAndCancel()
    continuation?.resume(with: result)
  }
}

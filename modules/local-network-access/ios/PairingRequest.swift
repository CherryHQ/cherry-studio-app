import ExpoModulesCore
import Foundation

/// A single POST, with OS-managed connectivity waiting instead of replaying the pairing code.
/// Mutable state and URLSession completions are confined to the main queue.
final class PairingRequest: SharedObject, @unchecked Sendable {
  private var session: URLSession?
  private var promise: Promise?
  private var isConsumed = false

  func post(url: URL, headers: [String: String], body: String, promise: Promise) {
    guard !isConsumed else {
      promise.reject("ERR_PAIRING_CANCELLED", "Pairing request is no longer available")
      return
    }
    isConsumed = true
    guard url.scheme == "http", url.host != nil, url.path == "/pair",
      url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else {
      promise.reject("ERR_PAIRING_URL", "Invalid desktop pairing URL")
      return
    }
    self.promise = promise

    let configuration = URLSessionConfiguration.ephemeral
    configuration.waitsForConnectivity = true
    configuration.timeoutIntervalForRequest = 4
    configuration.timeoutIntervalForResource = 30
    configuration.httpShouldSetCookies = false
    let session = URLSession(configuration: configuration, delegate: PairingRedirectBlocker(), delegateQueue: .main)
    self.session = session
    var request = URLRequest(url: url, timeoutInterval: 4)
    request.httpMethod = "POST"
    request.httpBody = Data(body.utf8)
    request.allHTTPHeaderFields = headers
    session.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        guard let self, let promise = self.promise else { return }
        self.promise = nil
        self.session?.finishTasksAndInvalidate()
        self.session = nil
        if error != nil {
          // Do not expose URLs or pairing credentials through native error descriptions.
          promise.reject("ERR_PAIRING_NETWORK", "Desktop pairing request failed")
        } else if let response = response as? HTTPURLResponse {
          promise.resolve([
            "status": response.statusCode,
            "body": String(decoding: data ?? Data(), as: UTF8.self)
          ])
        } else {
          promise.reject("ERR_PAIRING_RESPONSE", "Invalid desktop pairing response")
        }
      }
    }.resume()
  }

  func cancel() {
    isConsumed = true
    session?.invalidateAndCancel()
    session = nil
    promise?.reject("ERR_PAIRING_CANCELLED", "Desktop pairing request cancelled")
    promise = nil
  }

  override func sharedObjectWillRelease() {
    DispatchQueue.main.async { self.cancel() }
  }
}

private final class PairingRedirectBlocker: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession,
    task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void
  ) {
    // Return the 3xx response; never forward the pairing code to another endpoint.
    completionHandler(nil)
  }
}

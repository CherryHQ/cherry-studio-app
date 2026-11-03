import ExpoModulesCore
import Foundation

public class RelaySocketModule: Module {
  private var sockets: [String: RelayConnection] = [:]

  public func definition() -> ModuleDefinition {
    Name("RelaySocket")
    Events("socket")
    Function("connect") { (id: String, address: String) in
      DispatchQueue.main.async {
        guard self.sockets[id] == nil, self.sockets.count < 32,
          let url = URL(string: address), url.scheme == "wss", url.host != nil,
          url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
          url.path == "/v1/relay" else {
          self.sendEvent("socket", ["id": id, "type": "error"])
          return
        }
        let socket = RelayConnection(url: url) { [weak self] event in
          self?.sendEvent("socket", event.merging(["id": id]) { _, next in next })
          if event["type"] as? String == "close" { self?.sockets.removeValue(forKey: id) }
        }
        self.sockets[id] = socket
        socket.start()
      }
    }
    AsyncFunction("send") { (id: String, data: String, binary: Bool, promise: Promise) in
      guard let socket = self.sockets[id] else {
        promise.reject("ERR_RELAY_CLOSED", "Relay socket is closed")
        return
      }
      socket.send(data, binary: binary, promise: promise)
    }.runOnQueue(.main)
    Function("received") { (id: String) in
      DispatchQueue.main.async { self.sockets[id]?.received() }
    }
    Function("close") { (id: String) in
      DispatchQueue.main.async { self.sockets[id]?.finish() }
    }
    OnDestroy {
      DispatchQueue.main.async {
        for socket in Array(self.sockets.values) { socket.finish() }
        self.sockets.removeAll()
      }
    }
  }
}

/// State and completion delivery are serialized on main. Only one receive crosses the bridge at a time.
private final class RelayConnection: NSObject, URLSessionWebSocketDelegate {
  private let url: URL
  private let emit: ([String: Any]) -> Void
  private var session: URLSession!
  private var task: URLSessionWebSocketTask!
  private var closed = false
  private var open = false
  private var pendingSend: Promise?
  private var sendTimeout: DispatchWorkItem?
  private var receiveTimeout: DispatchWorkItem?
  private var awaitingReceipt = false
  private static let maxBytes = 65_560

  init(url: URL, emit: @escaping ([String: Any]) -> Void) { self.url = url; self.emit = emit }
  func start() {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.httpCookieStorage = nil
    configuration.urlCredentialStorage = nil
    configuration.urlCache = nil
    configuration.timeoutIntervalForRequest = 60
    session = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
    task = session.webSocketTask(with: url)
    task.maximumMessageSize = Self.maxBytes
    task.resume()
  }

  func send(_ value: String, binary: Bool, promise: Promise) {
    guard open, !closed, pendingSend == nil else {
      promise.reject("ERR_RELAY_SEND", "Relay socket is closed or busy")
      return
    }
    let bytes = binary ? Data(base64Encoded: value) : value.data(using: .utf8)
    guard let bytes, bytes.count <= Self.maxBytes else {
      promise.reject("ERR_RELAY_SIZE", "Invalid Relay frame")
      finish(failed: true)
      return
    }
    pendingSend = promise
    let timeout = DispatchWorkItem { [weak self] in self?.finish(failed: true) }
    sendTimeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timeout)
    task.send(binary ? .data(bytes) : .string(value)) { [weak self] error in
      DispatchQueue.main.async {
        guard let self, !self.closed else { return }
        if error != nil { self.finish(failed: true); return }
        self.sendTimeout?.cancel()
        self.sendTimeout = nil
        let pending = self.pendingSend
        self.pendingSend = nil
        pending?.resolve()
      }
    }
  }
  private func receive() {
    guard !closed else { return }
    task.receive { [weak self] result in
      DispatchQueue.main.async {
        guard let self, !self.closed else { return }
        guard case .success(let message) = result else { self.finish(failed: true); return }
        self.awaitingReceipt = true
        let timeout = DispatchWorkItem { [weak self] in self?.finish(failed: true) }
        self.receiveTimeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 15, execute: timeout)
        switch message {
        case .data(let data): self.emit(["type": "message", "binary": true, "data": data.base64EncodedString()])
        case .string(let value): self.emit(["type": "message", "binary": false, "data": value])
        @unknown default: self.finish(failed: true)
        }
      }
    }
  }
  func received() {
    guard awaitingReceipt, !closed else { return }
    awaitingReceipt = false
    receiveTimeout?.cancel()
    receiveTimeout = nil
    receive()
  }
  func finish(failed: Bool = false) {
    guard !closed else { return }
    closed = true
    sendTimeout?.cancel()
    receiveTimeout?.cancel()
    pendingSend?.reject("ERR_RELAY_CLOSED", "Relay socket closed before send completed")
    pendingSend = nil
    task?.cancel(with: .goingAway, reason: nil)
    session?.invalidateAndCancel()
    if failed { emit(["type": "error"]) }
    emit(["type": "close"])
  }
  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocol: String?) {
    guard !closed else { return }
    open = true
    emit(["type": "open"])
    receive()
  }
  func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) { finish() }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) { finish(failed: error != nil) }
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

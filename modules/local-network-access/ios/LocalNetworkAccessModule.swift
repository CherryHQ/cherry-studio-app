import Darwin
import ExpoModulesCore
import UIKit

public class LocalNetworkAccessModule: Module {
  private var prompt: LocalNetworkPrompt?

  public func definition() -> ModuleDefinition {
    Name("LocalNetworkAccess")

    AsyncFunction("request") { (promise: Promise) in
      guard self.prompt == nil else {
        promise.reject("ERR_NETWORK_PROMPT_BUSY", "A local network prompt is already pending")
        return
      }
      let prompt = LocalNetworkPrompt { [weak self] in
        self?.prompt = nil
        promise.resolve()
      }
      self.prompt = prompt
      prompt.start()
    }.runOnQueue(.main)

    Class(PairingRequest.self) {
      Constructor { PairingRequest() }
      AsyncFunction("post") {
        (request: PairingRequest, url: URL, headers: [String: String], body: String, promise: Promise) in
        request.post(url: url, headers: headers, body: body, promise: promise)
      }.runOnQueue(.main)
      AsyncFunction("cancel") { (request: PairingRequest) in
        request.cancel()
      }.runOnQueue(.main)
    }

    OnDestroy {
      DispatchQueue.main.async { self.prompt?.finish() }
    }
  }
}

/// Only attempts to present the system sheet. No discovery, traffic, or grant inference.
private final class LocalNetworkPrompt {
  private var completion: (() -> Void)?
  private var observer: NSObjectProtocol?
  private var settle: DispatchWorkItem?

  init(completion: @escaping () -> Void) {
    self.completion = completion
  }

  func start() {
    observer = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
    ) { [weak self] _ in self?.settleWhenActive() }
    triggerPrompt()
    settleWhenActive()
  }

  private func settleWhenActive() {
    settle?.cancel()
    // Give the OS a chance to present its sheet before another permission is requested.
    // This is a presentation grace period, not an authorization check or network timeout.
    let work = DispatchWorkItem { [weak self] in
      guard UIApplication.shared.applicationState == .active else { return }
      self?.finish()
    }
    settle = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: work)
  }

  private func triggerPrompt() {
    // Apple TN3179: connect UDP sockets to link-local addresses without sending packets.
    // No suitable interface is a no-op; actual pairing handles connectivity later.
    var interfaces: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&interfaces) == 0, let first = interfaces else { return }
    defer { freeifaddrs(first) }
    for entry in sequence(first: first, next: { $0.pointee.ifa_next }) {
      guard entry.pointee.ifa_flags & UInt32(IFF_BROADCAST) != 0,
        let raw = entry.pointee.ifa_addr,
        raw.pointee.sa_family == UInt8(AF_INET6),
        Int(raw.pointee.sa_len) >= MemoryLayout<sockaddr_in6>.size else { continue }
      let address = UnsafeRawPointer(raw).load(as: sockaddr_in6.self)
      let bytes = address.sin6_addr.__u6_addr.__u6_addr8
      guard bytes.0 == 0xfe, bytes.1 & 0xc0 == 0x80 else { continue }
      for _ in 0..<2 {
        var target = address
        target.sin6_port = UInt16(9).bigEndian
        withUnsafeMutableBytes(of: &target.sin6_addr) { buffer in
          for index in 8..<16 { buffer[index] = UInt8.random(in: 0...255) }
        }
        let descriptor = socket(AF_INET6, SOCK_DGRAM, 0)
        guard descriptor >= 0 else { continue }
        withUnsafePointer(to: &target) { pointer in
          pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            _ = Darwin.connect(descriptor, $0, socklen_t(MemoryLayout<sockaddr_in6>.size))
          }
        }
        close(descriptor)
      }
    }
  }

  func finish() {
    guard let completion else { return }
    self.completion = nil
    settle?.cancel()
    settle = nil
    if let observer { NotificationCenter.default.removeObserver(observer) }
    observer = nil
    completion()
  }
}

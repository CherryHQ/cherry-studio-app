import Darwin
import ExpoModulesCore
import Foundation
import Network

public class RemoteDiscoveryModule: Module {
  private var discovery: DesktopBrowser?

  public func definition() -> ModuleDefinition {
    Name("RemoteDiscovery")
    Events("change")
    Function("start") { (generation: Int) in
      DispatchQueue.main.async {
        if self.discovery != nil { return }
        let discovery = DesktopBrowser { [weak self] event in
          self?.sendEvent("change", event.merging(["generation": generation]) { _, next in next })
        }
        self.discovery = discovery
        discovery.start()
      }
    }
    Function("setBrowsing") { (enabled: Bool) in
      DispatchQueue.main.async { self.discovery?.setBrowsing(enabled) }
    }
    Function("stop") {
      DispatchQueue.main.async {
        self.discovery?.stop()
        self.discovery = nil
      }
    }
    OnDestroy {
      DispatchQueue.main.async {
        self.discovery?.stop()
        self.discovery = nil
      }
    }
  }
}

private final class DesktopBrowser: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
  private let emit: ([String: Any]) -> Void
  private var browser: NetServiceBrowser?
  private var services: [String: NetService] = [:]
  private var refresh: Timer?
  private var monitor: NWPathMonitor?
  private var seenPath = false
  private var active = false

  init(emit: @escaping ([String: Any]) -> Void) { self.emit = emit }

  func start() {
    active = true
    let monitor = NWPathMonitor()
    self.monitor = monitor
    monitor.pathUpdateHandler = { [weak self] _ in
      guard let self, self.active else { return }
      if self.seenPath {
        let browsing = self.browser != nil
        self.setBrowsing(false)
        self.emit(["type": "network"])
        if browsing { self.setBrowsing(true) }
      }
      self.seenPath = true
    }
    monitor.start(queue: .main)
  }

  func setBrowsing(_ enabled: Bool) {
    guard active, enabled != (browser != nil) else { return }
    if !enabled {
      refresh?.invalidate()
      refresh = nil
      browser?.delegate = nil
      browser?.stop()
      browser = nil
      for (id, service) in services {
        service.delegate = nil
        service.stopMonitoring()
        service.stop()
        emit(["type": "remove", "id": id])
      }
      services.removeAll()
      return
    }
    let browser = NetServiceBrowser()
    self.browser = browser
    browser.delegate = self
    browser.searchForServices(ofType: "_cherry-remote._tcp.", inDomain: "local.")
    refresh = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
      guard let self else { return }
      for service in self.services.values {
        service.stop()
        service.resolve(withTimeout: 4)
      }
    }
  }

  func stop() {
    setBrowsing(false)
    active = false
    monitor?.cancel()
    monitor = nil
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
    guard self.browser === browser, services.count < 64 else { return }
    let id = UUID().uuidString
    services[id] = service
    service.delegate = self
    service.resolve(withTimeout: 4)
    service.startMonitoring()
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
    guard self.browser === browser else { return }
    let removed = services.filter { $0.value == service }
    for (id, value) in removed {
      value.delegate = nil
      value.stopMonitoring()
      value.stop()
      services.removeValue(forKey: id)
      emit(["type": "remove", "id": id])
    }
  }

  func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String: NSNumber]) {
    guard self.browser === browser else { return }
    emit(["type": "unavailable"])
    setBrowsing(false)
  }

  func netServiceDidResolveAddress(_ sender: NetService) { publish(sender) }
  func netService(_ sender: NetService, didUpdateTXTRecord data: Data) { publish(sender) }
  func netService(_ sender: NetService, didNotResolve errorDict: [String: NSNumber]) {
    guard let id = services.first(where: { $0.value === sender })?.key else { return }
    emit(["type": "remove", "id": id])
  }

  private func publish(_ service: NetService) {
    guard browser != nil, let id = services.first(where: { $0.value === service })?.key,
      let data = service.txtRecordData(), data.count <= 512 else { return }
    let txt = NetService.dictionary(fromTXTRecord: data).compactMapValues { String(data: $0, encoding: .utf8) }
    let hosts = (service.addresses ?? []).prefix(16).compactMap { data -> String? in
      data.withUnsafeBytes { raw in
        guard let base = raw.baseAddress, data.count >= MemoryLayout<sockaddr>.size else { return nil }
        let address = base.assumingMemoryBound(to: sockaddr.self)
        var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        guard getnameinfo(address, socklen_t(data.count), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { return nil }
        return String(cString: host)
      }
    }
    emit(["type": "service", "id": id, "txt": txt, "hosts": hosts, "port": service.port])
  }
}

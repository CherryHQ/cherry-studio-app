import ExpoModulesCore
import Foundation

public class SystemIntegrationModule: Module {
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("SystemIntegration")
    Events("onPending", "onIntentCancelled")
    OnCreate {
      self.observers = [
        NotificationCenter.default.addObserver(forName: SystemEntryStore.pendingNotification, object: nil, queue: .main) { [weak self] _ in self?.sendEvent("onPending") },
        NotificationCenter.default.addObserver(forName: SystemEntryStore.cancelledNotification, object: nil, queue: .main) { [weak self] event in
          if let id = event.userInfo?["id"] as? String { self?.sendEvent("onIntentCancelled", ["id": id]) }
        }
      ]
    }
    OnDestroy { self.observers.forEach { NotificationCenter.default.removeObserver($0) }; self.observers = [] }
    AsyncFunction("claimNextEntry") { try SystemEntryStore.claimNext() }
    AsyncFunction("releaseEntry") { (id: String) in SystemEntryStore.release(id) }
    AsyncFunction("completeEntry") { (id: String) in try SystemEntryStore.complete(id) }
    AsyncFunction("finishIntent") { (id: String, result: [String: Any]) in SystemEntryStore.finishIntent(id, result: result) }
    AsyncFunction("publishAgents") { (agents: [[String: String]]) in
      let metadata = agents.prefix(1000).compactMap { agent -> [String: String]? in
        guard let id = agent["id"], !id.isEmpty, id.count <= 512, let name = agent["name"] else { return nil }
        return ["id": id, "name": String(name.prefix(255))]
      }
      try SystemIntegrationFiles.write(metadata, to: SystemIntegrationFiles.root().appendingPathComponent("agents.json"))
    }
  }
}

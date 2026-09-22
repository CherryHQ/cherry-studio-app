import ExpoModulesCore
import Foundation

public class SystemIntegrationModule: Module {
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("SystemIntegration")
    Events("onPending")
    OnCreate {
      self.observers = [
        NotificationCenter.default.addObserver(forName: SystemEntryStore.pendingNotification, object: nil, queue: .main) { [weak self] _ in self?.sendEvent("onPending") }
      ]
    }
    OnDestroy { self.observers.forEach { NotificationCenter.default.removeObserver($0) }; self.observers = [] }
    AsyncFunction("claimNextEntry") { try SystemEntryStore.claimNext() }
    AsyncFunction("releaseEntry") { (id: String) in SystemEntryStore.release(id) }
    AsyncFunction("completeEntry") { (id: String) in try SystemEntryStore.complete(id) }
  }
}

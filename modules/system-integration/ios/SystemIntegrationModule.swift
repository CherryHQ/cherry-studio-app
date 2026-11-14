import ExpoModulesCore
import Foundation
import ActivityKit
import UIKit

public class SystemIntegrationModule: Module {
  private var observers: [NSObjectProtocol] = []
  private let backgroundExecution = BackgroundExecution()
  private let backgroundAudio = BackgroundAudio()
  private var continuedProcessing: AnyObject?

  @available(iOS 26.0, *)
  private var continuedTasks: ContinuedProcessing {
    if let tasks = continuedProcessing as? ContinuedProcessing { return tasks }
    let tasks = ContinuedProcessing()
    continuedProcessing = tasks
    return tasks
  }

  public func definition() -> ModuleDefinition {
    Name("SystemIntegration")
    Events("onPending", "onBackgroundExecutionExpired", "onBackgroundAudioStateChanged", "onContinuedProcessingStateChanged")
    OnCreate {
      self.observers = [
        NotificationCenter.default.addObserver(forName: SystemEntryStore.pendingNotification, object: nil, queue: .main) { [weak self] _ in self?.sendEvent("onPending") }
      ]
    }
    OnDestroy {
      self.observers.forEach { NotificationCenter.default.removeObserver($0) }
      self.observers = []
      DispatchQueue.main.async {
        self.backgroundExecution.end()
        self.backgroundAudio.dispose()
        if #available(iOS 26.0, *) { (self.continuedProcessing as? ContinuedProcessing)?.dispose() }
        self.continuedProcessing = nil
      }
    }
    AsyncFunction("beginBackgroundExecution") { (id: String) -> Bool in
      self.backgroundExecution.begin(id: id) { [weak self] expiredId in
        self?.sendEvent("onBackgroundExecutionExpired", ["id": expiredId])
      }
    }.runOnQueue(.main)
    AsyncFunction("endBackgroundExecution") { (id: String) in
      self.backgroundExecution.end(id: id)
    }.runOnQueue(.main)
    AsyncFunction("beginContinuedProcessingTask") { (id: String, progress: ContinuedProcessingProgress) -> Bool in
      guard #available(iOS 26.0, *) else { return false }
      return self.continuedTasks.begin(id: id, progress: progress) { [weak self] owner, state in
        self?.sendEvent("onContinuedProcessingStateChanged", ["id": owner, "state": state])
      }
    }.runOnQueue(.main)
    AsyncFunction("updateContinuedProcessingTask") { (id: String, progress: ContinuedProcessingProgress) in
      if #available(iOS 26.0, *) { (self.continuedProcessing as? ContinuedProcessing)?.update(id: id, progress: progress) }
    }.runOnQueue(.main)
    AsyncFunction("endContinuedProcessingTask") { (id: String, success: Bool) in
      if #available(iOS 26.0, *) { (self.continuedProcessing as? ContinuedProcessing)?.end(id: id, success: success) }
    }.runOnQueue(.main)
    AsyncFunction("beginBackgroundAudioExecution") { (id: String) -> Bool in
      self.backgroundAudio.begin(id: id) { [weak self] owner, active in
        self?.sendEvent("onBackgroundAudioStateChanged", ["id": owner, "active": active])
      }
    }.runOnQueue(.main)
    AsyncFunction("endBackgroundAudioExecution") { (id: String) in
      self.backgroundAudio.end(id: id)
    }.runOnQueue(.main)
    AsyncFunction("beginBackgroundAudioUse") { (id: String, kind: String) in
      self.backgroundAudio.beginUse(id: id, kind: kind)
    }.runOnQueue(.main)
    AsyncFunction("endBackgroundAudioUse") { (id: String) in
      self.backgroundAudio.endUse(id: id)
    }.runOnQueue(.main)
    AsyncFunction("claimNextEntry") { try SystemEntryStore.claimNext() }
    AsyncFunction("releaseEntry") { (id: String) in SystemEntryStore.release(id) }
    AsyncFunction("completeEntry") { (id: String) in try SystemEntryStore.complete(id) }
    AsyncFunction("getBackgroundRunSettings") { () -> [String: Any] in
      ["batteryOptimizationExempt": NSNull(),
       "lowPowerMode": ProcessInfo.processInfo.isLowPowerModeEnabled,
       "liveActivitiesEnabled": ActivityAuthorizationInfo().areActivitiesEnabled,
       "manufacturer": "Apple"]
    }
    AsyncFunction("openBackgroundRunSettings") {
      await MainActor.run {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
      }
    }
  }
}

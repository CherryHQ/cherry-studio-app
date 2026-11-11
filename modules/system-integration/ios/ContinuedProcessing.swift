import BackgroundTasks
import ExpoModulesCore
import UIKit

struct ContinuedProcessingProgress: Record {
  @Field var title: String = ""
  @Field var subtitle: String = ""
  @Field var completedUnitCount: Double = 0
  @Field var totalUnitCount: Double = 1
}

/** One native request per foreground user task. All bookkeeping stays on the main queue. */
@available(iOS 26.0, *)
final class ContinuedProcessing {
  private final class Entry {
    let identifier: String
    var progress: ContinuedProcessingProgress
    let onChange: (String, String) -> Void
    var task: BGContinuedProcessingTask?
    var admissionTimeout: DispatchWorkItem?

    init(identifier: String, progress: ContinuedProcessingProgress, onChange: @escaping (String, String) -> Void) {
      self.identifier = identifier
      self.progress = progress
      self.onChange = onChange
    }
  }

  private var entries: [String: Entry] = [:]

  func begin(id: String, progress: ContinuedProcessingProgress, onChange: @escaping (String, String) -> Void) -> Bool {
    guard UIApplication.shared.applicationState == .active,
          let bundleId = Bundle.main.bundleIdentifier else { return false }
    if entries[id] != nil { return true }
    // Register the concrete identifier, not a wildcard handler. Never reuse a registration on reload.
    let identifier = "\(bundleId).continued-processing.\(UUID().uuidString)"
    let entry = Entry(identifier: identifier, progress: progress, onChange: onChange)
    let scheduler = BGTaskScheduler.shared
    guard scheduler.register(forTaskWithIdentifier: identifier, using: .main, launchHandler: { [weak self, weak entry] task in
      guard let self, let entry, self.entries[id] === entry,
            let continuedTask = task as? BGContinuedProcessingTask else {
        task.setTaskCompleted(success: false)
        return
      }
      entry.admissionTimeout?.cancel()
      entry.admissionTimeout = nil
      entry.task = continuedTask
      continuedTask.expirationHandler = { [weak self, weak entry] in
        DispatchQueue.main.async {
          guard let self, let entry, self.entries[id] === entry else { return }
          self.end(id: id, success: false)
          // Expiration also represents user cancellation. Never fall back to audio for this task.
          entry.onChange(id, "expired")
        }
      }
      self.update(id: id, progress: entry.progress)
      entry.onChange(id, "active")
    }) else { return false }
    entries[id] = entry

    let request = BGContinuedProcessingTaskRequest(identifier: identifier, title: progress.title, subtitle: progress.subtitle)
    request.strategy = .fail
    // Bound missing/delayed native admission. The finite UIKit window bridges this attempt.
    let timeout = DispatchWorkItem { [weak self, weak entry] in
      guard let self, let entry, self.entries[id] === entry, entry.task == nil else { return }
      self.end(id: id, success: false)
      entry.onChange(id, "unavailable")
    }
    entry.admissionTimeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: timeout)

    // iOS 27's submission reports errors asynchronously and must not run on the main thread.
    DispatchQueue.global(qos: .userInitiated).async { [weak self, weak entry] in
      let submitted: (Error?) -> Void = { error in
        DispatchQueue.main.async {
          guard let self, let entry, self.entries[id] === entry else {
            scheduler.cancel(taskRequestWithIdentifier: identifier)
            return
          }
          guard let error else { return }
          let state = entry.task == nil ? "unavailable" : "expired"
          NSLog("Cherry continued processing submission failed: %@", String(describing: error))
          self.end(id: id, success: false)
          entry.onChange(id, state)
        }
      }
      if #available(iOS 27.0, *) {
        scheduler.submitTaskRequest(request, completionHandler: submitted)
      } else {
        do {
          try scheduler.submit(request)
          submitted(nil)
        } catch {
          submitted(error)
        }
      }
    }
    return true
  }

  func update(id: String, progress: ContinuedProcessingProgress) {
    guard let entry = entries[id] else { return }
    entry.progress = progress
    guard let task = entry.task else { return }
    // Native callers cannot turn malformed or out-of-range progress into an Int64 trap.
    let total = progress.totalUnitCount.isFinite ? max(1, min(progress.totalUnitCount, 1_000_000)) : 1
    let completed = progress.completedUnitCount.isFinite ? max(0, min(progress.completedUnitCount, total - 1)) : 0
    task.progress.totalUnitCount = Int64(total)
    task.progress.completedUnitCount = Int64(completed)
    task.updateTitle(progress.title, subtitle: progress.subtitle)
  }

  func end(id: String, success: Bool) {
    guard let entry = entries.removeValue(forKey: id) else { return }
    entry.admissionTimeout?.cancel()
    entry.task?.expirationHandler = nil
    if success, let task = entry.task { task.progress.completedUnitCount = task.progress.totalUnitCount }
    entry.task?.setTaskCompleted(success: success)
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: entry.identifier)
  }

  func dispose() {
    for id in Array(entries.keys) { end(id: id, success: false) }
  }
}

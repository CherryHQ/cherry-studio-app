import UIKit

/** One finite UIKit assertion shared by the app's unfinished work. Main queue only. */
final class BackgroundExecution {
  private var task: UIBackgroundTaskIdentifier = .invalid
  private var owner: String?
  private var isExpired = false

  func begin(id: String, onExpire: @escaping (String) -> Void) -> Bool {
    if UIApplication.shared.applicationState == .active { isExpired = false }
    guard !isExpired else { return false }
    if owner == id { return task != .invalid }
    end()
    owner = id
    task = UIApplication.shared.beginBackgroundTask(withName: "Cherry task completion") { [weak self] in
      guard let self, self.owner == id else { return }
      self.isExpired = true
      // Release the assertion natively even if JavaScript is already suspended.
      self.end()
      onExpire(id)
    }
    if task == .invalid { owner = nil }
    return task != .invalid
  }

  func end(id: String) {
    guard owner == id else { return }
    end()
  }

  func end() {
    let previous = task
    task = .invalid
    owner = nil
    if previous != .invalid { UIApplication.shared.endBackgroundTask(previous) }
  }
}

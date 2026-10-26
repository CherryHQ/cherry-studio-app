import ExpoModulesCore
import UIKit

/// Reports the display's division region in window coordinates. UIKit posts no notification when
/// reserved regions change, so the view re-reads them after every layout pass, when it joins a
/// window, and when the hinge moves.
public final class FoldRegionObserverView: ExpoView {
  private let onFoldChange = EventDispatcher()
  private var hingeObservation: Any?
  private var reported: NSDictionary?
  private var hasReported = false

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    hingeObservation = FoldRegionReader.observeHinge(of: self) { [weak self] in
      self?.setNeedsLayout()
      self?.report()
    }
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    report()
  }

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    report()
  }

  private func report() {
    guard window != nil else { return }
    let fold = FoldRegionReader.divisionRegion(in: self) as NSDictionary?
    if hasReported && fold == reported { return }
    hasReported = true
    reported = fold
    onFoldChange(["fold": fold ?? NSNull()])
  }
}

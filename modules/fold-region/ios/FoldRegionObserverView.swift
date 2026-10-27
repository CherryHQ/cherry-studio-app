import ExpoModulesCore
import UIKit

/// Reports the host and display's division region together in window coordinates. UIKit posts no notification when
/// reserved regions change, so the view re-reads them after every layout pass, when it joins a
/// window, and when the hinge moves.
public final class FoldRegionObserverView: ExpoView {
  private let onLayoutChange = EventDispatcher()
  private var hingeObservation: Any?
  private var reported: NSDictionary?

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
    guard let window else { return }
    let host = convert(bounds, to: nil)
    let fold = FoldRegionReader.divisionRegion(in: self) as NSDictionary?
    let layout: [String: Any] = [
      "host": ["x": host.origin.x, "y": host.origin.y, "width": host.width, "height": host.height],
      "insets": ["left": safeAreaInsets.left, "right": safeAreaInsets.right],
      "window": ["width": window.bounds.width, "height": window.bounds.height],
      "fold": fold ?? NSNull()
    ]
    let snapshot = layout as NSDictionary
    if snapshot == reported { return }
    reported = snapshot
    onLayoutChange(layout)
  }
}

import ExpoModulesCore
import UIKit

// One entry in the long-press menu. Mirrors the JS `ContextMenuAction`.
struct ContextMenuActionRecord: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  // SF Symbol name (e.g. "doc.on.doc"). Empty -> no icon.
  @Field var image: String = ""
  @Field var destructive: Bool = false
  @Field var disabled: Bool = false
}

// A thin UIKit-based context menu around the RN children.
//
// Why UIKit (`UIContextMenuInteraction`) and not SwiftUI `ContextMenu`
// (`@expo/ui`): SwiftUI's `Host matchContents` under-measures tall content
// vertically, so the bubble overflows its list row and the next message overlaps
// it. A plain `ExpoView` lets RN/Yoga measure the children normally — no overlap.
//
// Why custom (vs `@react-native-menu/menu`): that library returns a context-menu
// configuration with `previewProvider: nil`, so iOS auto-snapshots the whole view
// into a rectangular platter — the lift looks boxy and doesn't hug the rounded
// bubble. Here we supply our own `UITargetedPreview` with a rounded `visiblePath`
// and a clear background, so the lift hugs the bubble exactly (the native look).
final class ContextMenuView: ExpoView, UIContextMenuInteractionDelegate {
  let onPressAction = EventDispatcher()
  let onOpenMenu = EventDispatcher()
  let onCloseMenu = EventDispatcher()

  var menuActions: [ContextMenuActionRecord] = []
  var menuTitle: String = ""
  var previewCornerRadius: CGFloat = 14

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIContextMenuInteraction(delegate: self))
  }

  // MARK: - UIContextMenuInteractionDelegate

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    configurationForMenuAtLocation location: CGPoint
  ) -> UIContextMenuConfiguration? {
    onOpenMenu()
    return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
      self?.buildMenu()
    }
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? {
    makeTargetedPreview()
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration
  ) -> UITargetedPreview? {
    makeTargetedPreview()
  }

  func contextMenuInteraction(
    _ interaction: UIContextMenuInteraction,
    willEndFor configuration: UIContextMenuConfiguration,
    animator: UIContextMenuInteractionAnimating?
  ) {
    onCloseMenu()
  }

  // MARK: - Helpers

  private func buildMenu() -> UIMenu {
    let children: [UIMenuElement] = menuActions.map { action in
      var attributes: UIMenuElement.Attributes = []
      if action.destructive { attributes.insert(.destructive) }
      if action.disabled { attributes.insert(.disabled) }
      let image = action.image.isEmpty ? nil : UIImage(systemName: action.image)
      return UIAction(title: action.title, image: image, attributes: attributes) { [weak self] _ in
        self?.onPressAction(["id": action.id])
      }
    }
    return UIMenu(title: menuTitle, children: children)
  }

  // Target the interaction view itself so the lift shows the real rendered bubble,
  // then clip it to the rounded rect so the preview hugs the bubble instead of
  // sitting in a boxy card.
  //
  // The platter background is the canvas color the bubble normally sits on — NOT
  // `.clear`. The bubble's fill is semi-transparent (e.g. 5%-alpha), so a clear
  // platter would let the context menu's dimming scrim show through it and the
  // bubble would look far darker than in the list. Compositing over the real
  // backdrop keeps the lift identical to the in-list appearance.
  private func makeTargetedPreview() -> UITargetedPreview? {
    guard bounds.width > 0, bounds.height > 0 else { return nil }
    let parameters = UIPreviewParameters()
    parameters.backgroundColor = backdropColor()
    if previewCornerRadius > 0 {
      parameters.visiblePath = UIBezierPath(roundedRect: bounds, cornerRadius: previewCornerRadius)
    }
    return UITargetedPreview(view: self, parameters: parameters)
  }

  // Nearest opaque ancestor background (the chat canvas the bubble renders over),
  // falling back to the adaptive system background.
  private func backdropColor() -> UIColor {
    var view = superview
    while let current = view {
      if let background = current.backgroundColor,
         background.cgColor.alpha > 0.99 {
        return background
      }
      view = current.superview
    }
    return .systemBackground
  }
}

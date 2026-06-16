import ExpoModulesCore

public final class ContextMenuModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ContextMenu")

    View(ContextMenuView.self) {
      Events("onPressAction", "onOpenMenu", "onCloseMenu")

      Prop("actions") { (view: ContextMenuView, actions: [ContextMenuActionRecord]?) in
        view.menuActions = actions ?? []
      }

      Prop("title") { (view: ContextMenuView, title: String?) in
        view.menuTitle = title ?? ""
      }

      // Corner radius (pt) used to clip the lifted long-press preview so it hugs
      // the bubble's rounded shape. Defaults to 14 (matches JS `rounded-xl`).
      Prop("previewCornerRadius") { (view: ContextMenuView, radius: Double?) in
        view.previewCornerRadius = CGFloat(radius ?? 14)
      }
    }
  }
}

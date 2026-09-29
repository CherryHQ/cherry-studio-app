import ExpoModulesCore

public class ImageDropTargetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ImageDropTarget")

    // A plain container view: children render as usual, and a UIDropInteraction
    // on the container accepts image drags started in other apps.
    View(ImageDropTargetView.self) {
      Events("onDragEnter", "onDragLeave", "onDropImages")
      Prop("enabled") { (view: ImageDropTargetView, value: Bool) in
        view.isEnabled = value
      }
    }
  }
}

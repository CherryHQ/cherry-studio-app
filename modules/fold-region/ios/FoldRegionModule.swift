import ExpoModulesCore

public class FoldRegionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FoldRegion")

    // An invisible view that reports one host/fold snapshot whenever layout or the hinge changes.
    View(FoldRegionObserverView.self) {
      Events("onLayoutChange")
    }
  }
}

import CherryMermaid
import ExpoModulesCore
import UIKit

private let renderingQueue = DispatchQueue(label: "expo.modules.MermaidRenderer", qos: .userInitiated)

public class MermaidRendererModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MermaidRenderer")
    AsyncFunction("render") { (source: String, palette: [String: String]) -> [String: Any]? in
      // Font measurement and layout stay off Expo's shared serial queue and the main thread.
      guard let diagram = DiagramRenderer(fontFamily: "Helvetica").render(
        source: source, palette: palette, textMeasurer: AppleTextMeasurer()
      ) else { return nil }
      return [
        "svg": diagram.svg, "width": diagram.width, "height": diagram.height,
        "accessibilityLabel": diagram.accessibilityLabel,
      ]
    }.runOnQueue(renderingQueue)
  }
}

private final class AppleTextMeasurer: NSObject, DiagramTextMeasurer {
  func measure(text: String, fontSize: Double, fontWeight: Int32, italic: Bool) -> MeasuredText {
    let name: String
    switch (fontWeight >= 600, italic) {
    case (true, true): name = "Helvetica-BoldOblique"
    case (true, false): name = "Helvetica-Bold"
    case (false, true): name = "Helvetica-Oblique"
    case (false, false): name = "Helvetica"
    }
    let font = UIFont(name: name, size: CGFloat(fontSize)) ?? UIFont.systemFont(ofSize: CGFloat(fontSize))
    let size = (text as NSString).size(withAttributes: [.font: font])
    return MeasuredText(width: Double(size.width), height: max(Double(size.height), fontSize * 1.2))
  }
}

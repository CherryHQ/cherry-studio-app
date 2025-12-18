import ExpoModulesCore

public class TextInputWrapperModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TextInputWrapper")
    
    View(TextInputWrapperView.self) {
      Events("onPaste")
    }
  }
}

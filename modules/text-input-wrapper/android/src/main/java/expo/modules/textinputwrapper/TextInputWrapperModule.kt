package expo.modules.textinputwrapper

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TextInputWrapperModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TextInputWrapper")
    
    View(TextInputWrapperView::class) {
      Events("onPaste")
    }
  }
}

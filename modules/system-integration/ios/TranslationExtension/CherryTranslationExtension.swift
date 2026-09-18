import ExtensionKit
import SwiftUI
import TranslationUIProvider

@main
final class CherryTranslationExtension: TranslationUIProviderExtension {
  required init() {}

  var body: some TranslationUIProviderExtensionScene {
    TranslationUIProviderSelectedTextScene { context in
      CherryTranslationView(text: context.inputText.map { String($0.characters) } ?? "") {
        context.finish(translation: nil)
      }
    }
  }
}

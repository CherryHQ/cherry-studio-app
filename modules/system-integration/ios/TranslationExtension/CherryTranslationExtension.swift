import ExtensionKit
import SwiftUI
import TranslationUIProvider

@main
final class CherryTranslationExtension: TranslationUIProviderExtension {
  required init() {}

  var body: some TranslationUIProviderExtensionScene {
    TranslationUIProviderSelectedTextScene { context in
      CherrySelectedTextTranslationView(context: context)
    }
  }
}

private struct CherrySelectedTextTranslationView: View {
  let context: any TranslationUIProviderContext

  var body: some View {
    // Read the observable context in a View body: the system can deliver text after presentation.
    if let input = context.inputText {
      let text = String(input.characters)
      CherryTranslationView(text: text) {
        context.finish(translation: nil)
      }
      // The translation view owns a StateObject. A new selection needs a new session.
      .id(text)
    } else {
      ProgressView()
    }
  }
}

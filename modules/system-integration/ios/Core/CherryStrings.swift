import Foundation

struct CherryStrings {
  private let bundle: Bundle

  init() {
    let language = TranslationConfigurationStore.displayValues()?["interfaceLanguage"] as? String
    let localization = language?.hasPrefix("zh") == true ? "zh-Hans" : "en"
    if language != nil, let path = Bundle.main.path(forResource: localization, ofType: "lproj"), let localized = Bundle(path: path) {
      bundle = localized
    } else { bundle = .main }
  }

  subscript(_ key: String) -> String {
    NSLocalizedString(key, tableName: "SystemIntegration", bundle: bundle,
      value: Self.fallback[key] ?? Self.fallback["failed"]!, comment: "")
  }

  private static let fallback = [
    "title": "Cherry Translate", "target": "Translate into", "original": "Original", "result": "Translation",
    "running": "Translating…", "copy": "Copy translation", "copied": "Copied", "retry": "Retry", "close": "Close",
    "privacy": "Cherry does not save translation records.",
    "modelNotConfigured": "Choose a translation model in Cherry → Settings → Model settings, then return here.",
    "configurationStale": "Translation settings changed. Open Cherry to sync them, then retry.",
    "credentialsUnavailable": "Unlock your device and open Cherry to sync the model credentials.",
    "modelUnavailable": "The selected translation model is unavailable. Choose another model in Cherry.",
    "providerUnavailable": "The selected model provider is unavailable. Check its settings in Cherry.",
    "unsupportedProvider": "This model connection is not supported in the temporary window. Choose an HTTPS OpenAI Chat Completions compatible model with a standard API key in Cherry.",
    "invalidInput": "Select some text to translate.", "inputTooLarge": "Select a shorter passage (up to 16,000 characters).",
    "authenticationFailed": "The model credentials were rejected. Update them in Cherry.",
    "rateLimited": "The provider is rate limiting requests. Try again later.", "timedOut": "Translation timed out. Try again.",
    "networkUnavailable": "Could not connect to the provider. Check your connection and retry.",
    "invalidResult": "The model did not return a complete translation. Try again.",
    "failed": "The action failed. Open Cherry to review its settings and try again.",
    "shareTitle": "Share to Cherry", "shareSave": "Save for Cherry", "shareTranslate": "Temporary translation",
    "shareSaved": "Saved. Open Cherry to choose an Agent and review the content before sending.",
    "sharePreparing": "Preparing shared content…",
    "shareFailed": "Could not read this share. Share up to 10 files (25 MB each, 50 MB total) and try again."
  ]
}

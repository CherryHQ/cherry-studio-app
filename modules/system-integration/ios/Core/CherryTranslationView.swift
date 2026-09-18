import Combine
import SwiftUI
import UIKit

@MainActor
final class TranslationViewModel: ObservableObject {
  @Published var source: String
  @Published var targetLanguage: String
  @Published var result = ""
  @Published var status = "ready"
  @Published var errorCode: String?
  @Published var modelName: String
  @Published var copied = false
  let strings = CherryStrings()
  private var task: Task<Void, Never>?
  private var generation = 0
  private var disposed = false
  private let inputFailure: String?

  init(text: String) {
    inputFailure = text.utf16.count > 16_000 ? "inputTooLarge" : text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "invalidInput" : nil
    source = inputFailure == nil ? text : ""
    let metadata = TranslationConfigurationStore.displayValues()
    let language = metadata?["targetLanguage"] as? String ?? Locale.current.identifier.replacingOccurrences(of: "_", with: "-")
    targetLanguage = TemporaryTranslation.isLanguage(language) ? language : "en-US"
    modelName = [metadata?["modelName"] as? String, metadata?["providerName"] as? String].compactMap { $0 }.joined(separator: " · ")
  }

  func translate() {
    guard !disposed else { return }
    task?.cancel()
    generation += 1
    let current = generation
    result = ""
    copied = false
    errorCode = nil
    if let inputFailure { status = "failed"; errorCode = inputFailure; return }
    status = "running"
    let text = source
    let language = targetLanguage
    task = Task { [weak self] in
      do {
        let configuration = try TranslationConfigurationStore.read()
        guard let self, !self.disposed else { return }
        self.modelName = "\(configuration.modelName) · \(configuration.providerName)"
        let result = try await TemporaryTranslation.translate(text, targetLanguage: language)
        try Task.checkCancellation()
        guard current == self.generation, !self.disposed else { return }
        self.result = result
        self.status = "succeeded"
      } catch is CancellationError {
        // The owner clears state; a cancelled result never updates a replacement request.
      } catch {
        guard let self, current == self.generation, !self.disposed else { return }
        self.errorCode = (error as? TranslationFailure)?.code ?? "failed"
        self.status = "failed"
      }
    }
  }

  func copy() {
    guard !result.isEmpty else { return }
    UIPasteboard.general.setItems([["public.utf8-plain-text": result]], options: [.localOnly: true])
    copied = true
  }

  func dispose() {
    disposed = true
    generation += 1
    task?.cancel()
    task = nil
    source = ""
    result = ""
    errorCode = nil
    status = "disposed"
  }
}

struct CherryTranslationView: View {
  @Environment(\.scenePhase) private var scenePhase
  @StateObject private var model: TranslationViewModel
  private let close: () -> Void

  @MainActor init(text: String, close: @escaping () -> Void) {
    _model = StateObject(wrappedValue: TranslationViewModel(text: text))
    self.close = close
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        HStack {
          Text(model.strings["title"]).font(.title2).fontWeight(.semibold)
          Spacer()
          Button(model.strings["close"]) { model.dispose(); close() }
        }
        if !model.modelName.isEmpty { Text(model.modelName).font(.subheadline).foregroundStyle(.secondary) }
        Picker(model.strings["target"], selection: $model.targetLanguage) {
          ForEach(languages, id: \.self) { language in
            Text(Locale.current.localizedString(forIdentifier: language) ?? language).tag(language)
          }
        }
        .onChange(of: model.targetLanguage) { _, _ in model.translate() }
        Text(model.strings["original"]).font(.headline)
        Text(model.source).textSelection(.enabled)
        Text(model.strings["result"]).font(.headline)
        if model.status == "running" { ProgressView(model.strings["running"]) }
        if let error = model.errorCode { Text(model.strings[error]) }
        if !model.result.isEmpty { Text(model.result).textSelection(.enabled) }
        HStack {
          Button(model.strings[model.copied ? "copied" : "copy"]) { model.copy() }.disabled(model.result.isEmpty)
          Button(model.strings["retry"]) { model.translate() }.disabled(model.status == "running")
        }
        Text(model.strings["privacy"]).font(.footnote).foregroundStyle(.secondary)
      }
      .padding(20)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .privacySensitive()
    .task { model.translate() }
    .onDisappear { model.dispose() }
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { model.dispose(); close() }
    }
  }

  private var languages: [String] {
    var values = [model.targetLanguage, "zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR", "fr-FR", "de-DE", "es-ES", "pt-PT", "ru-RU", "vi-VN"]
    var seen = Set<String>()
    values = values.filter { seen.insert($0).inserted }
    return values
  }
}

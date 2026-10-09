import Combine
import SwiftUI
import UIKit
import UniformTypeIdentifiers

@MainActor
final class ShareViewModel: ObservableObject {
  @Published var text = ""
  @Published var fileNames: [String] = []
  @Published var state = "loading"
  let strings = CherryStrings()
  private var files: [SharedAttachment] = []
  private var task: Task<Void, Never>?
  private var directory: URL?
  private var disposed = false

  func load(_ items: [NSExtensionItem]) {
    let providers = items.flatMap { $0.attachments ?? [] }
    guard !providers.isEmpty, providers.count <= 10 else { state = "failed"; return }
    task = Task {
      do {
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true,
          attributes: [.protectionKey: FileProtectionType.complete])
        directory = temporary
        var texts: [String] = []
        var attachments: [SharedAttachment] = []
        var total = 0
        for provider in providers {
          try Task.checkCancellation()
          if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            let file = try await copyFile(provider, type: UTType.fileURL.identifier, directory: temporary)
            total += try file.url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard total <= 50 * 1024 * 1024 else { throw SystemEntryFailure(code: "shareFailed") }
            attachments.append(file)
          } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            let value = try await loadItem(provider, type: UTType.url.identifier)
            if let url = value as? URL, !url.isFileURL { texts.append(url.absoluteString) }
            else { throw SystemEntryFailure(code: "shareFailed") }
          } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            let value = try await loadItem(provider, type: UTType.plainText.identifier)
            if let value = value as? String { texts.append(value) }
            else if let bytes = value as? Data, bytes.count <= 524_288, let value = String(data: bytes, encoding: .utf8) { texts.append(value) }
            else { throw SystemEntryFailure(code: "shareFailed") }
          } else {
            guard let identifier = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .data) == true }) else {
              throw SystemEntryFailure(code: "shareFailed")
            }
            let file = try await copyFile(provider, type: identifier, directory: temporary)
            total += try file.url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard total <= 50 * 1024 * 1024 else { throw SystemEntryFailure(code: "shareFailed") }
            attachments.append(file)
          }
        }
        try Task.checkCancellation()
        guard !disposed else { throw CancellationError() }
        let source = texts.joined(separator: "\n\n")
        guard source.utf16.count <= 131_072, !source.isEmpty || !attachments.isEmpty else { throw SystemEntryFailure(code: "shareFailed") }
        text = source
        files = attachments
        fileNames = attachments.map(\.name)
        state = "ready"
      } catch {
        cleanupFiles()
        if !disposed { state = "failed" }
      }
    }
  }

  func save() {
    guard state == "ready", !disposed else { return }
    state = "saving"
    // Share extension input is already bounded before staging.
    let source = text
    let attachments = files
    task = Task {
      do {
        try Task.checkCancellation()
        let staging = Task.detached { try SystemEntryStore.stageShare(text: source, attachments: attachments) }
        try await withTaskCancellationHandler { try await staging.value } onCancel: { staging.cancel() }
        text = ""
        cleanupFiles()
        if !disposed { state = "saved" }
      } catch { if !disposed { state = "failed" } }
    }
  }

  func dispose() {
    disposed = true
    task?.cancel()
    task = nil
    text = ""
    cleanupFiles()
  }

  private func cleanupFiles() {
    if let directory { try? FileManager.default.removeItem(at: directory) }
    directory = nil
    files = []
    fileNames = []
  }

  private func loadItem(_ provider: NSItemProvider, type: String) async throws -> NSSecureCoding {
    try await withCheckedThrowingContinuation { continuation in
      provider.loadItem(forTypeIdentifier: type, options: nil) { item, error in
        if error != nil { continuation.resume(throwing: SystemEntryFailure(code: "shareFailed")) }
        else if let item { continuation.resume(returning: item) }
        else { continuation.resume(throwing: SystemEntryFailure(code: "shareFailed")) }
      }
    }
  }

  private func copyFile(_ provider: NSItemProvider, type: String, directory: URL) async throws -> SharedAttachment {
    try await withCheckedThrowingContinuation { continuation in
      let loaded: (URL?) -> Void = { url in
        do {
          guard let url else {
            throw SystemEntryFailure(code: "shareFailed")
          }
          let scoped = url.startAccessingSecurityScopedResource()
          defer { if scoped { url.stopAccessingSecurityScopedResource() } }
          let metadata = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
          guard metadata.isRegularFile == true, (metadata.fileSize ?? 0) <= 25 * 1024 * 1024 else { throw SystemEntryFailure(code: "shareFailed") }
          let destination = directory.appendingPathComponent(UUID().uuidString)
          try FileManager.default.copyItem(at: url, to: destination)
          try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: destination.path)
          continuation.resume(returning: SharedAttachment(url: destination,
            name: provider.suggestedName ?? url.lastPathComponent,
            mediaType: UTType(type)?.preferredMIMEType ?? UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"))
        } catch { continuation.resume(throwing: SystemEntryFailure(code: "shareFailed")) }
      }
      if type == UTType.fileURL.identifier {
        provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in loaded(item as? URL) }
      } else {
        provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in loaded(url) }
      }
    }
  }
}

struct CherryShareView: View {
  @ObservedObject var model: ShareViewModel
  let close: () -> Void

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        HStack {
          Text(model.strings["shareTitle"]).font(.title2).fontWeight(.semibold)
          Spacer()
          Button(model.strings["close"], action: close)
        }
        switch model.state {
        case "loading", "saving": ProgressView(model.strings["sharePreparing"])
        case "saved": Text(model.strings["shareSaved"])
        case "failed": Text(model.strings["shareFailed"])
        default:
          if !model.text.isEmpty { Text(String(model.text.prefix(2000))) }
          ForEach(Array(model.fileNames.enumerated()), id: \.offset) { _, name in Text(name).font(.subheadline) }
          Button(model.strings["shareSave"]) { model.save() }.buttonStyle(.borderedProminent)
        }
      }.padding(20)
    }
  }
}

final class CherryShareViewController: UIViewController {
  private let model = ShareViewModel()
  override func viewDidLoad() {
    super.viewDidLoad()
    let host = UIHostingController(rootView: CherryShareView(model: model, close: { [weak self] in self?.close() }))
    addChild(host)
    host.view.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(host.view)
    NSLayoutConstraint.activate([
      host.view.topAnchor.constraint(equalTo: view.topAnchor), host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor), host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor)
    ])
    host.didMove(toParent: self)
    model.load(extensionContext?.inputItems as? [NSExtensionItem] ?? [])
  }
  override func viewDidDisappear(_ animated: Bool) { super.viewDidDisappear(animated); model.dispose() }
  private func close() { model.dispose(); extensionContext?.completeRequest(returningItems: nil) }
}

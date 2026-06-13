import ExpoModulesCore
import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

struct InlinePhotoPickerAsset: Identifiable {
  let id: String
  let uri: String
  let fileName: String
  let mimeType: String
  let fileSize: Int64
}

final class InlinePhotoPickerState: ObservableObject {
  @Published var selection: [PhotosPickerItem] = []
}

final class InlinePhotoPickerView: ExpoView {
  let onSelectionChange = EventDispatcher()
  let onError = EventDispatcher()

  var selectionLimit = 0 {
    didSet {
      if oldValue != selectionLimit {
        reloadPicker()
      }
    }
  }

  var disabled = false {
    didSet {
      if oldValue != disabled {
        reloadPicker()
      }
    }
  }

  var resetKey = 0 {
    didSet {
      if oldValue != resetKey {
        resetSelection()
      }
    }
  }

  private let pickerState = InlinePhotoPickerState()
  private var hostingController: UIHostingController<InlinePhotoPickerContentView>?
  private var exportedSelectionIds = Set<String>()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    reloadPicker()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    hostingController?.view.frame = bounds
  }

  fileprivate func handleSelectionChange(_ items: [PhotosPickerItem]) {
    Task { [weak self] in
      await self?.exportSelectedItems(items)
    }
  }

  private func resetSelection() {
    exportedSelectionIds.removeAll()
    pickerState.selection = []
  }

  private func reloadPicker() {
    hostingController?.view.removeFromSuperview()
    hostingController = nil

    let contentView = InlinePhotoPickerContentView(
      state: pickerState,
      selectionLimit: selectionLimit,
      disabled: disabled,
      onSelectionChange: { [weak self] items in
        self?.handleSelectionChange(items)
      }
    )
    let controller = UIHostingController(rootView: contentView)
    controller.view.backgroundColor = .clear
    controller.view.frame = bounds
    controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(controller.view)
    hostingController = controller
  }

  private func exportSelectedItems(_ items: [PhotosPickerItem]) async {
    let selectedIds = Set(items.map(Self.itemId))
    exportedSelectionIds.formIntersection(selectedIds)

    let pendingItems = items.filter { item in
      let id = Self.itemId(item)
      return !exportedSelectionIds.contains(id)
    }

    guard !pendingItems.isEmpty else {
      return
    }

    do {
      var assets: [InlinePhotoPickerAsset] = []

      for item in pendingItems {
        if let asset = try await Self.exportItem(item, id: Self.itemId(item)) {
          assets.append(asset)
        }
      }

      guard !assets.isEmpty else {
        return
      }

      for asset in assets {
        exportedSelectionIds.insert(asset.id)
      }

      await MainActor.run {
        onSelectionChange([
          "assets": assets.map { asset in
            [
              "assetId": asset.id,
              "uri": asset.uri,
              "fileName": asset.fileName,
              "mimeType": asset.mimeType,
              "fileSize": asset.fileSize,
            ]
          }
        ])
      }
    } catch {
      await MainActor.run {
        onError(["message": error.localizedDescription])
      }
    }
  }

  private static func exportItem(_ item: PhotosPickerItem, id: String) async throws -> InlinePhotoPickerAsset? {
    if let url = try await item.loadTransferable(type: URL.self) {
      return try copyPickedFile(from: url, id: id, contentType: item.supportedContentTypes.first)
    }

    if let data = try await item.loadTransferable(type: Data.self) {
      return try writePickedData(data, id: id, contentType: item.supportedContentTypes.first)
    }

    return nil
  }

  private static func copyPickedFile(from sourceURL: URL, id: String, contentType: UTType?) throws -> InlinePhotoPickerAsset {
    let fileManager = FileManager.default
    let fileName = fileNameForPickedAsset(
      id: id,
      contentType: contentType,
      fallbackFileExtension: sourceURL.pathExtension
    )
    let destinationURL = destinationURL(fileName: fileName)

    if fileManager.fileExists(atPath: destinationURL.path) {
      try fileManager.removeItem(at: destinationURL)
    }

    try fileManager.copyItem(at: sourceURL, to: destinationURL)
    return try makeAsset(id: id, fileURL: destinationURL, fallbackContentType: contentType)
  }

  private static func writePickedData(_ data: Data, id: String, contentType: UTType?) throws -> InlinePhotoPickerAsset {
    let destinationURL = destinationURL(fileName: fileNameForPickedAsset(id: id, contentType: contentType))
    try data.write(to: destinationURL, options: .atomic)
    return try makeAsset(id: id, fileURL: destinationURL, fallbackContentType: contentType)
  }

  private static func makeAsset(id: String, fileURL: URL, fallbackContentType: UTType?) throws -> InlinePhotoPickerAsset {
    let values = try fileURL.resourceValues(forKeys: [.fileSizeKey, .contentTypeKey])
    let contentType = values.contentType ?? fallbackContentType ?? .image

    return InlinePhotoPickerAsset(
      id: id,
      uri: fileURL.absoluteString,
      fileName: fileURL.lastPathComponent,
      mimeType: contentType.preferredMIMEType ?? "image/*",
      fileSize: Int64(values.fileSize ?? 0)
    )
  }

  private static func itemId(_ item: PhotosPickerItem) -> String {
    item.itemIdentifier ?? item.hashValue.description
  }

  private static func fileNameForPickedAsset(
    id: String,
    contentType: UTType?,
    fallbackFileExtension: String = "jpg"
  ) -> String {
    let fallbackExtension = fallbackFileExtension.isEmpty ? "jpg" : fallbackFileExtension
    let fileExtension = contentType?.preferredFilenameExtension ?? fallbackExtension
    return "\(safeFileName(id)).\(fileExtension)"
  }

  private static func destinationURL(fileName: String) -> URL {
    let directoryURL = FileManager.default.temporaryDirectory.appendingPathComponent(
      "InlinePhotoPicker",
      isDirectory: true
    )
    try? FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)
    return directoryURL.appendingPathComponent(fileName)
  }

  private static func safeFileName(_ value: String) -> String {
    let allowedCharacters = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
    let scalars = value.unicodeScalars.map { scalar in
      allowedCharacters.contains(scalar) ? Character(scalar) : "-"
    }
    let fileName = String(scalars).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    return fileName.isEmpty ? UUID().uuidString : fileName
  }
}

struct InlinePhotoPickerContentView: View {
  @ObservedObject var state: InlinePhotoPickerState
  let selectionLimit: Int
  let disabled: Bool
  let onSelectionChange: ([PhotosPickerItem]) -> Void

  var body: some View {
    PhotosPicker(
      selection: $state.selection,
      maxSelectionCount: selectionLimit,
      selectionBehavior: .continuousAndOrdered,
      matching: .images,
      preferredItemEncoding: .automatic,
      photoLibrary: .shared()
    ) {
      EmptyView()
    }
    .photosPickerStyle(.inline)
    .disabled(disabled)
    .onChange(of: state.selection) { items in
      onSelectionChange(items)
    }
  }
}

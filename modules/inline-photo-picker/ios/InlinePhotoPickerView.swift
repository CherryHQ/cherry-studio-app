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
  let onBackPress = EventDispatcher()
  let onConfirm = EventDispatcher()
  let onAllPhotosPress = EventDispatcher()

  // Template carrying a literal `{count}` token (e.g. "添加 {count} 张照片").
  // Single-brace so i18next leaves it untouched; SwiftUI substitutes the live
  // selection count so the confirm label updates without a JS round-trip.
  var confirmLabelTemplate = "" {
    didSet {
      if oldValue != confirmLabelTemplate {
        reloadPicker()
      }
    }
  }

  var backAccessibilityLabel = "" {
    didSet {
      if oldValue != backAccessibilityLabel {
        reloadPicker()
      }
    }
  }

  var allPhotosLabel = "" {
    didSet {
      if oldValue != allPhotosLabel {
        reloadPicker()
      }
    }
  }

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

  // Report zero safe area to everything hosted inside (the inline PhotosPicker
  // included). The picker otherwise inherits the sheet's safe-area insets through
  // the view chain and reserves a variable top strip (~10–40pt depending on
  // launch) above the first row — `controller.safeAreaRegions = []` doesn't catch
  // it because the hosting controller isn't a child view controller. Forcing the
  // host's own insets to zero removes that strip at the source.
  override var safeAreaInsets: UIEdgeInsets { .zero }

  override func layoutSubviews() {
    super.layoutSubviews()
    hostingController?.view.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    embedHostingControllerIfNeeded()
  }

  // Embed the hosting controller in the view-controller hierarchy instead of
  // leaving it as a bare `addSubview` child. A detached hosting controller loses
  // trait/environment propagation and never has its safe-area regions applied
  // (`controller.safeAreaRegions = []` is a no-op until it has a parent VC), and
  // it gives SwiftUI effects like Liquid Glass their proper rendering context.
  // Note: over the system PHPicker's out-of-process grid the glass still falls
  // back to a frosted material on the Simulator because it can't sample that
  // remote surface — embedding is the correct setup, not a guaranteed fix there.
  private func embedHostingControllerIfNeeded() {
    guard let hostingController,
          hostingController.parent == nil,
          window != nil,
          let parentViewController = closestViewController else {
      return
    }
    parentViewController.addChild(hostingController)
    hostingController.didMove(toParent: parentViewController)
  }

  private var closestViewController: UIViewController? {
    var responder: UIResponder? = next
    while let current = responder {
      if let viewController = current as? UIViewController {
        return viewController
      }
      responder = current.next
    }
    return nil
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
    if let existing = hostingController {
      existing.willMove(toParent: nil)
      existing.view.removeFromSuperview()
      existing.removeFromParent()
    }
    hostingController = nil

    let contentView = InlinePhotoPickerContentView(
      state: pickerState,
      selectionLimit: selectionLimit,
      disabled: disabled,
      confirmLabelTemplate: confirmLabelTemplate,
      backAccessibilityLabel: backAccessibilityLabel,
      allPhotosLabel: allPhotosLabel,
      onSelectionChange: { [weak self] items in
        self?.handleSelectionChange(items)
      },
      onBackPress: { [weak self] in
        self?.onBackPress()
      },
      onConfirm: { [weak self] in
        self?.onConfirm()
      },
      onAllPhotosPress: { [weak self] in
        self?.onAllPhotosPress()
      }
    )
    let controller = UIHostingController(rootView: contentView)
    // Report zero safe area to the hosted SwiftUI so the inline picker's internal
    // scroll view doesn't inset the grid below the status bar / above the home
    // indicator — that inset was the source of the top/bottom gaps. Our floating
    // controls re-add bottom spacing via pickerState.bottomInset instead.
    controller.safeAreaRegions = []
    controller.view.backgroundColor = .clear
    controller.view.frame = bounds
    controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(controller.view)
    hostingController = controller
    embedHostingControllerIfNeeded()
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
  let confirmLabelTemplate: String
  let backAccessibilityLabel: String
  let allPhotosLabel: String
  let onSelectionChange: ([PhotosPickerItem]) -> Void
  let onBackPress: () -> Void
  let onConfirm: () -> Void
  let onAllPhotosPress: () -> Void

  var body: some View {
    ZStack(alignment: .bottom) {
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
      // Strip the inline picker's own chrome so only the photo grid remains; we
      // provide our own back + confirm controls. accessoryVisibility hides the
      // top/bottom accessory bars (X/title/gear/subtitle, clear/tabs/checkmark);
      // disabledCapabilities removes the search field, album navigation
      // (返回/筛选/「选择照片」), the staging strip, and bulk selection actions.
      .photosPickerAccessoryVisibility(.hidden)
      .photosPickerDisabledCapabilities([
        .search, .stagingArea, .collectionNavigation, .selectionActions,
      ])
      .disabled(disabled)
      .onChange(of: state.selection) { items in
        onSelectionChange(items)
      }
      // Force the picker to fill the whole ZStack; otherwise its grid sizes to an
      // intrinsic height shorter than the sheet, leaving a gap below it.
      .frame(maxWidth: .infinity, maxHeight: .infinity)

      bottomBar
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  // The controls sit the same distance from the left, right and bottom edges so
  // the round back button is symmetrically inset in its corner (equal margin from
  // the side and from the safe-area bottom).
  private let controlsInset: CGFloat = 32

  // Floating ChatGPT-style controls layered over the grid. The HStack itself has
  // no background, so only the two buttons capture touches — taps elsewhere fall
  // through to the photo grid behind.
  private var bottomBar: some View {
    HStack(alignment: .center, spacing: 10) {
      backButton

      Spacer(minLength: 12)

      // "All photos" and the confirm button are mutually exclusive: the confirm
      // button replaces it once at least one photo is selected.
      if state.selection.isEmpty {
        allPhotosButton
      } else {
        confirmButton
      }
    }
    .padding(.horizontal, controlsInset)
    // Same inset on every edge so the controls are visually symmetric. The two
    // buttons sit in the bottom corners, clear of the centered home indicator, so
    // they don't need extra safe-area clearance.
    .padding(.bottom, controlsInset)
  }

  // Native Liquid Glass on iOS 26+, with an `.ultraThinMaterial` fallback for
  // earlier systems (the app's deployment target is 17.0).
  @ViewBuilder
  private var backButton: some View {
    if #available(iOS 26.0, *) {
      Button(action: onBackPress) {
        Image(systemName: "chevron.left")
      }
      .buttonStyle(.glass)
      .buttonBorderShape(.circle)
      // Size glass buttons via controlSize (the supported API), not .frame —
      // .large matches the system photo picker's bottom controls. .frame only
      // recenters the natural-size glass without resizing it.
      .controlSize(.large)
      .accessibilityLabel(backAccessibilityLabel)
    } else {
      Button(action: onBackPress) {
        Image(systemName: "chevron.left")
          .foregroundStyle(.primary)
          .frame(width: 44, height: 44)
          .background(.ultraThinMaterial, in: Circle())
      }
      .accessibilityLabel(backAccessibilityLabel)
    }
  }

  @ViewBuilder
  private var allPhotosButton: some View {
    if #available(iOS 26.0, *) {
      Button(action: onAllPhotosPress) {
        Text(allPhotosLabel)
      }
      .buttonStyle(.glass)
      .buttonBorderShape(.capsule)
      .controlSize(.large)
      .accessibilityLabel(allPhotosLabel)
    } else {
      Button(action: onAllPhotosPress) {
        Text(allPhotosLabel)
          .foregroundStyle(.primary)
          .padding(.horizontal, 16)
          .frame(height: 44)
          .background(.ultraThinMaterial, in: Capsule())
      }
      .accessibilityLabel(allPhotosLabel)
    }
  }

  @ViewBuilder
  private var confirmButton: some View {
    if #available(iOS 26.0, *) {
      Button(action: onConfirm) {
        Text(confirmLabel)
      }
      .buttonStyle(.glassProminent)
      .buttonBorderShape(.capsule)
      .tint(.accentColor)
      .controlSize(.large)
      .accessibilityLabel(confirmLabel)
    } else {
      Button(action: onConfirm) {
        Text(confirmLabel)
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(.white)
          .padding(.horizontal, 20)
          .frame(height: 44)
          .background(Color.accentColor, in: Capsule())
      }
      .accessibilityLabel(confirmLabel)
    }
  }

  private var confirmLabel: String {
    confirmLabelTemplate.replacingOccurrences(of: "{count}", with: "\(state.selection.count)")
  }
}

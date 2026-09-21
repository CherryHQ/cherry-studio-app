import ExpoModulesCore
import ImageIO
import UniformTypeIdentifiers
import UIKit

/**
 * A container view that accepts system drag-and-drop sessions carrying images
 * (Photos, Safari, Files, ...) and copies each dropped image into the app's
 * cache before handing the file URLs to JS.
 *
 * The drop conversation follows `UIDropInteractionDelegate`: `canHandle` admits
 * only sessions with at least one image item, `sessionDidUpdate` proposes
 * `.copy`, and `performDrop` loads every image item's in-place file
 * representation. In-place loading keeps the original bytes — HEIC stays HEIC,
 * filenames and EXIF survive — so the file JS receives matches what the photo
 * library picker would hand over, without decoding the bitmap in between.
 *
 * No photo-library permission is involved: the data is delivered by the system
 * as part of the user's explicit drag, never through `PHAsset` APIs.
 */
public final class ImageDropTargetView: ExpoView {
  private let onDragEnter = EventDispatcher()
  private let onDragLeave = EventDispatcher()
  private let onDropImages = EventDispatcher()

  private let fileManager = FileManager.default
  private lazy var dropDirectory: URL? = {
    let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
    let directory = caches?.appendingPathComponent("ImageDropTarget", isDirectory: true)
    if let directory, !fileManager.fileExists(atPath: directory.path) {
      try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
    }
    return directory
  }()

  public required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIDropInteraction(delegate: self))
  }

  // MARK: - Loading dropped items

  /// Loads the image file for one drag item and returns its payload, or nil
  /// when the provider cannot deliver a file. `loadInPlaceFileRepresentation`
  /// deletes the source URL when its handler returns, so the copy happens
  /// synchronously inside it.
  private func loadImagePayload(
    from provider: NSItemProvider,
    completion: @escaping ([String: Any]?) -> Void
  ) {
    provider.loadInPlaceFileRepresentation(
      forTypeIdentifier: UTType.image.identifier
    ) { [weak self] url, _, error in
      guard let self, let url else {
        if let error {
          NSLog("ImageDropTarget: failed to load a dropped image: \(error.localizedDescription)")
        }
        completion(nil)
        return
      }
      completion(self.copyDroppedImage(from: url, provider: provider))
    }
  }

  private func copyDroppedImage(from source: URL, provider: NSItemProvider) -> [String: Any]? {
    let didStartAccessing = source.startAccessingSecurityScopedResource()
    defer {
      if didStartAccessing {
        source.stopAccessingSecurityScopedResource()
      }
    }

    guard let directory = dropDirectory else {
      return nil
    }
    // Items of the same batch load concurrently and can race the existence
    // check in `uniqueDestinationURL`; a failed copy retries with a fresh
    // unique name instead of silently dropping one of the images.
    var copyError: Error?
    for _ in 0..<3 {
      let destination = uniqueDestinationURL(
        in: directory,
        preferredName: provider.suggestedName ?? source.lastPathComponent,
        fallbackName: source.lastPathComponent
      )
      do {
        try fileManager.copyItem(at: source, to: destination)
        return payload(for: destination)
      } catch {
        copyError = error
      }
    }
    if let copyError {
      NSLog("ImageDropTarget: failed to copy a dropped image: \(copyError.localizedDescription)")
    }
    return nil
  }

  /// A collision-free cache URL that keeps the source extension and the
  /// provider's suggested name when both are usable.
  private func uniqueDestinationURL(
    in directory: URL,
    preferredName: String,
    fallbackName: String
  ) -> URL {
    var name = preferredName.lastPathComponent
    if name.isEmpty {
      name = fallbackName.lastPathComponent
    }
    if name.isEmpty {
      name = UUID().uuidString
    }
    if !name.contains(".") {
      let fallbackExtension = fallbackName.pathExtension
      if !fallbackExtension.isEmpty {
        name = "\(name).\(fallbackExtension)"
      }
    }

    var url = directory.appendingPathComponent(name)
    if fileManager.fileExists(atPath: url.path) {
      let uniqueName = "\(UUID().uuidString)-\(name)"
      url = directory.appendingPathComponent(uniqueName)
    }
    return url
  }

  /// File facts read from the copied file. Dimensions come from image
  /// metadata, which avoids decoding the full bitmap.
  private func payload(for fileURL: URL) -> [String: Any] {
    var payload: [String: Any] = [
      "name": fileURL.lastPathComponent,
      "uri": fileURL.absoluteString,
    ]

    if let attributes = try? fileManager.attributesOfItem(atPath: fileURL.path),
       let size = attributes[.size] as? NSNumber {
      payload["size"] = size.intValue
    }
    if let mediaType = mediaType(for: fileURL) {
      payload["mediaType"] = mediaType
    }

    if let imageSource = CGImageSourceCreateWithURL(fileURL as CFURL, nil),
       let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil)
         as? [CFString: Any] {
      if let width = properties[kCGImagePropertyPixelWidth] as? NSNumber {
        payload["width"] = width.intValue
      }
      if let height = properties[kCGImagePropertyPixelHeight] as? NSNumber {
        payload["height"] = height.intValue
      }
    }

    return payload
  }

  private func mediaType(for fileURL: URL) -> String? {
    if let contentType = try? fileURL.resourceValues(forKeys: [.contentTypeKey]).contentType {
      return contentType.preferredMIMEType
    }
    return UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType
  }
}

// MARK: - UIDropInteractionDelegate

extension ImageDropTargetView: UIDropInteractionDelegate {
  /// Only sessions that contain at least one image item enter the drop
  /// conversation; everything else gets the system's forbidden cue.
  public func dropInteraction(_ interaction: UIDropInteraction, canHandle session: UIDropSession)
    -> Bool {
    session.hasItemsConforming(toTypeIdentifiers: [UTType.image.identifier])
  }

  public func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnter session: UIDropSession) {
    onDragEnter()
  }

  public func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: UIDropSession) {
    onDragLeave()
  }

  public func dropInteraction(
    _ interaction: UIDropInteraction,
    sessionDidUpdate session: UIDropSession
  ) -> UIDropProposal {
    let hasImages = session.hasItemsConforming(toTypeIdentifiers: [UTType.image.identifier])
    // Cross-app drops are copies by definition (HIG: dragging between apps
    // always results in a copy).
    return UIDropProposal(operation: hasImages ? .copy : .cancel)
  }

  public func dropInteraction(_ interaction: UIDropInteraction, performDrop session: UIDropSession) {
    // The drop ends the hover, including the case where every item fails to
    // load, so JS always gets a chance to clear its highlight.
    onDragLeave()

    let imageItems = session.items.filter {
      $0.itemProvider.hasItemConformingToTypeIdentifier(UTType.image.identifier)
    }
    guard !imageItems.isEmpty else {
      onDropImages(["images": []])
      return
    }

    let group = DispatchGroup()
    let lock = NSLock()
    var payloads: [[String: Any]] = []

    for item in imageItems {
      group.enter()
      loadImagePayload(from: item.itemProvider) { payload in
        if let payload {
          lock.lock()
          payloads.append(payload)
          lock.unlock()
        }
        group.leave()
      }
    }

    group.notify(queue: .main) { [weak self] in
      guard let self else {
        return
      }
      self.onDropImages(["images": payloads])
    }
  }
}

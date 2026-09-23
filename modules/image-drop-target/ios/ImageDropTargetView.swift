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
 * Formats the send pipeline cannot consume (HEIC/HEIF/AVIF stills) are
 * re-encoded to JPEG during staging, so an imported drop never fails at send
 * time.
 *
 * No photo-library permission is involved: the data is delivered by the system
 * as part of the user's explicit drag, never through `PHAsset` APIs.
 */
public final class ImageDropTargetView: ExpoView {
  /// Mirrors the shared per-message image ceiling (`AI_IMAGE_INPUT_MAX_COUNT`),
  /// enforced before any provider I/O so an oversized drop does not start work
  /// whose results would only be discarded.
  private static let selectionLimit = 9
  /// Provider loads run concurrently but bounded, so a large Files drop cannot
  /// start one unbounded copy operation per item.
  private static let maxConcurrentLoads = 3
  /// What the send pipeline consumes; anything else is transcoded to JPEG.
  private static let supportedImageMIMETypes: Set<String> = [
    "image/gif", "image/jpeg", "image/png", "image/webp",
  ]

  /// When false the view ignores every drop session (the composer may be
  /// absent in preview or error states); the container stays mounted so the
  /// tree shape does not change.
  var isEnabled = true

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
      completion(self.stageDroppedImage(from: url, provider: provider))
    }
  }

  /// Copies the provider-backed source into staging and returns its payload.
  /// Apple requires in-place provider URLs to be accessed through
  /// `NSFileCoordinator` regardless of `isInPlace`; the `.forUploading` option
  /// coordinates a readable snapshot (including Files/iCloud providers), and
  /// the copy happens synchronously inside the coordinated block.
  private func stageDroppedImage(
    from source: URL,
    provider: NSItemProvider
  ) -> [String: Any]? {
    let didStartAccessing = source.startAccessingSecurityScopedResource()
    defer {
      if didStartAccessing {
        source.stopAccessingSecurityScopedResource()
      }
    }

    guard let directory = dropDirectory else {
      return nil
    }
    let coordinator = NSFileCoordinator(filePresenter: nil)
    var coordinationError: NSError?
    var stagedURL: URL?
    coordinator.coordinate(
      readingItemAt: source,
      options: [.forUploading],
      error: &coordinationError
    ) { snapshot in
      stagedURL = self.copyToStaging(from: snapshot, in: directory, provider: provider)
    }
    if let coordinationError {
      NSLog(
        "ImageDropTarget: failed to coordinate a dropped image: \(coordinationError.localizedDescription)"
      )
      return nil
    }
    guard let stagedURL else {
      return nil
    }
    // A still format the send pipeline rejects becomes JPEG now, while the
    // bytes are local — never at send time.
    guard let finalURL = transcodeToSupportedFormat(stagedURL, in: directory) else {
      try? fileManager.removeItem(at: stagedURL)
      return nil
    }
    return payload(for: finalURL)
  }

  /// Copies the coordinated snapshot into staging. Items of the same batch
  /// load concurrently and can race the existence check in
  /// `uniqueDestinationURL`; a failed copy retries with a fresh unique name
  /// instead of silently dropping one of the images.
  private func copyToStaging(from source: URL, in directory: URL, provider: NSItemProvider)
    -> URL? {
    var copyError: Error?
    for _ in 0..<3 {
      let destination = uniqueDestinationURL(
        in: directory,
        preferredName: provider.suggestedName ?? source.lastPathComponent,
        fallbackName: source.lastPathComponent
      )
      do {
        try fileManager.copyItem(at: source, to: destination)
        return destination
      } catch {
        copyError = error
      }
    }
    if let copyError {
      NSLog("ImageDropTarget: failed to copy a dropped image: \(copyError.localizedDescription)")
    }
    return nil
  }

  /// Re-encodes still images the send pipeline cannot consume into JPEG and
  /// returns the new URL, removing the staged original. Supported formats come
  /// back unchanged.
  private func transcodeToSupportedFormat(_ url: URL, in directory: URL) -> URL? {
    if let mediaType = mediaType(for: url),
       Self.supportedImageMIMETypes.contains(mediaType) {
      return url
    }
    guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil),
          CGImageSourceGetCount(imageSource) > 0 else {
      return nil
    }
    let baseName = url.deletingPathExtension().lastPathComponent
    let destination = uniqueDestinationURL(
      in: directory,
      preferredName: "\(baseName).jpg",
      fallbackName: "\(UUID().uuidString).jpg"
    )
    guard let destinationSink = CGImageDestinationCreateWithURL(
      destination as CFURL,
      UTType.jpeg.identifier as CFString,
      1,
      nil
    ) else {
      return nil
    }
    let options = [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary
    CGImageDestinationAddImageFromSource(destinationSink, imageSource, 0, options)
    guard CGImageDestinationFinalize(destinationSink) else {
      return nil
    }
    if url != destination {
      try? fileManager.removeItem(at: url)
    }
    return destination
  }

  /// A collision-free cache URL that keeps the source extension and the
  /// provider's suggested name when both are usable. Path components are read
  /// through `NSString`: they are NSString APIs, not members of Swift `String`.
  private func uniqueDestinationURL(
    in directory: URL,
    preferredName: String,
    fallbackName: String
  ) -> URL {
    var name = (preferredName as NSString).lastPathComponent
    if name.isEmpty {
      name = (fallbackName as NSString).lastPathComponent
    }
    if name.isEmpty {
      name = UUID().uuidString
    }
    if !name.contains(".") {
      let fallbackExtension = (fallbackName as NSString).pathExtension
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
  /// metadata, which avoids decoding the full bitmap. `id` is unique per
  /// staged item: staging paths can repeat once an earlier copy was cleaned
  /// up, so the URI cannot serve as the attachment identity.
  private func payload(for fileURL: URL) -> [String: Any] {
    var payload: [String: Any] = [
      "id": UUID().uuidString,
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
  /// conversation; everything else gets the system's forbidden cue. A disabled
  /// view (no composer to attach to) refuses every session.
  public func dropInteraction(_ interaction: UIDropInteraction, canHandle session: UIDropSession)
    -> Bool {
    isEnabled && session.hasItemsConforming(toTypeIdentifiers: [UTType.image.identifier])
  }

  public func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnter session: UIDropSession) {
    onDragEnter()
  }

  public func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: UIDropSession) {
    onDragLeave()
  }

  /// The final callback of every session, including cancellation and other
  /// termination paths that never exit "normally": the authoritative hover
  /// cleanup, so the JS highlight cannot stay stuck.
  public func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: UIDropSession) {
    onDragLeave()
  }

  public func dropInteraction(
    _ interaction: UIDropInteraction,
    sessionDidUpdate session: UIDropSession
  ) -> UIDropProposal {
    let hasImages = isEnabled && session.hasItemsConforming(toTypeIdentifiers: [UTType.image.identifier])
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
    // The per-message quota is applied before any provider I/O: an oversized
    // drop neither starts loads nor writes staging files for discarded items.
    let acceptedItems = Array(imageItems.prefix(Self.selectionLimit))
    guard !acceptedItems.isEmpty else {
      onDropImages(["failedCount": 0, "images": [], "totalDropped": imageItems.count])
      return
    }

    let group = DispatchGroup()
    let inFlight = DispatchSemaphore(value: Self.maxConcurrentLoads)
    let loadQueue = DispatchQueue(label: "cherry.imageDropTarget.load", attributes: .concurrent)
    let lock = NSLock()
    var indexedPayloads: [Int: [String: Any]] = [:]

    for (index, item) in acceptedItems.enumerated() {
      group.enter()
      loadQueue.async { [weak self] in
        inFlight.wait()
        // The view can be released while this worker queued on the semaphore;
        // leaving without its load would block the remaining workers forever.
        guard let self else {
          inFlight.signal()
          group.leave()
          return
        }
        self.loadImagePayload(from: item.itemProvider) { payload in
          if let payload {
            lock.lock()
            indexedPayloads[index] = payload
            lock.unlock()
          }
          inFlight.signal()
          group.leave()
        }
      }
    }

    group.notify(queue: .main) { [weak self] in
      guard let self else {
        return
      }
      // Results are compacted by original item index: attachment order follows
      // the drop order, not provider I/O timing.
      let payloads = acceptedItems.indices.compactMap { indexedPayloads[$0] }
      self.onDropImages([
        "failedCount": acceptedItems.count - payloads.count,
        "images": payloads,
        "totalDropped": imageItems.count,
      ])
    }
  }
}

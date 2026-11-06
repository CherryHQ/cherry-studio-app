import ExpoModulesCore
import Foundation
import ImageIO

/** Decode the first frame at a bounded size, applying camera orientation before recognition. */
internal func recognizeImageFile(
  _ url: URL, request: PdfExtractionRequest, languages: [String]
) throws -> String {
  try request.checkCancellation()
  guard let source = CGImageSourceCreateWithURL(
    url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary
  ), let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
    let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
    let height = properties[kCGImagePropertyPixelHeight] as? NSNumber,
    width.doubleValue > 0, height.doubleValue > 0 else { throw FailedToLoadImageException() }
  let edge = max(width.doubleValue, height.doubleValue)
  let scale = min(1, min(2560 / edge, sqrt(4_000_000 / (width.doubleValue * height.doubleValue))))
  let options: [CFString: Any] = [
    kCGImageSourceCreateThumbnailFromImageAlways: true,
    kCGImageSourceCreateThumbnailWithTransform: true,
    kCGImageSourceThumbnailMaxPixelSize: max(1, Int(edge * scale)),
    kCGImageSourceShouldCacheImmediately: true
  ]
  guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
    let context = CGContext(
      data: nil, width: image.width, height: image.height, bitsPerComponent: 8,
      bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
    ) else { throw FailedToLoadImageException() }
  // Transparent backgrounds must not turn dark text into black-on-black input.
  let rect = CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height))
  context.setFillColor(gray: 1, alpha: 1)
  context.fill(rect)
  context.draw(image, in: rect)
  guard let opaque = context.makeImage() else { throw FailedToLoadImageException() }
  try request.checkCancellation()
  return try request.recognize(opaque, languages: languages)
}

internal class FailedToLoadImageException: Exception {
  override var code: String { "FAILED_TO_LOAD_IMAGE" }
  override var reason: String { "Failed to decode image for text recognition" }
}

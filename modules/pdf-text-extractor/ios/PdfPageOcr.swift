import ExpoModulesCore
import PDFKit
import Vision

internal class PdfExtractionCancelledException: Exception {
  override var code: String { "PDF_EXTRACTION_CANCELLED" }
  override var reason: String { "PDF extraction cancelled" }
}

// The JS thread can cancel while the serial extraction queue is inside Vision.
internal final class PdfExtractionRequest {
  private let lock = NSLock()
  private var cancelled = false
  private var visionRequest: VNRequest?

  func cancel() {
    lock.lock()
    cancelled = true
    let active = visionRequest
    lock.unlock()
    active?.cancel()
  }

  func checkCancellation() throws {
    lock.lock()
    defer { lock.unlock() }
    if cancelled { throw PdfExtractionCancelledException() }
  }

  func recognize(_ image: CGImage, languages: [String]) throws -> String {
    let recognition = VNRecognizeTextRequest()
    recognition.recognitionLevel = .accurate
    recognition.usesLanguageCorrection = true
    recognition.recognitionLanguages = languages
    lock.lock()
    if cancelled {
      lock.unlock()
      throw PdfExtractionCancelledException()
    }
    visionRequest = recognition
    lock.unlock()
    defer {
      lock.lock()
      visionRequest = nil
      lock.unlock()
    }
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([recognition])
    try checkCancellation()
    return (recognition.results ?? []).compactMap { $0.topCandidates(1).first?.string }
      .joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

/// Vision languages for the resolved app language, plus the Chinese/Latin coverage shared with
/// Android. Nil disables OCR: an unsupported script yields plausible garbage, not an error.
internal func pdfOcrLanguages(for appLanguage: String?) throws -> [String]? {
  let probe = VNRecognizeTextRequest()
  probe.recognitionLevel = .accurate
  let supported = try probe.supportedRecognitionLanguages()
  let app = Locale.Language(identifier: appLanguage ?? "zh-Hans")
  let primary = supported.first {
    let candidate = Locale.Language(identifier: $0)
    return candidate.languageCode == app.languageCode && candidate.script == app.script
  }
  let script = app.script?.identifier
  guard primary != nil || script == "Latn" else { return nil }
  let shared = script == "Hant" ? ["en-US", "zh-Hant", "zh-Hans"] : ["en-US", "zh-Hans", "zh-Hant"]
  var languages: [String] = []
  for id in [primary].compactMap({ $0 }) + shared where supported.contains(id) && !languages.contains(id) {
    languages.append(id)
  }
  return languages
}

internal func hasUsablePdfText(_ text: String) -> Bool {
  !text.contains("\u{FFFD}") && text.unicodeScalars.contains {
    !CharacterSet.whitespacesAndNewlines.contains($0) && !CharacterSet.controlCharacters.contains($0)
  }
}

internal struct PdfPageRecognition {
  let text: String
  var unrecognized = false
}

internal func recognizePdfPage(
  _ page: PDFPage, request: PdfExtractionRequest, languages: [String]
) throws -> PdfPageRecognition {
  try request.checkCancellation()
  guard let source = page.pageRef else { throw FailedToLoadDocumentException() }
  let bounds = source.getBoxRect(.cropBox)
  let rotation = ((Int(source.rotationAngle) % 360) + 360) % 360
  let rotated = rotation % 180 == 90
  let width = rotated ? bounds.height : bounds.width
  let height = rotated ? bounds.width : bounds.height
  guard width.isFinite, height.isFinite, width > 0, height > 0 else {
    throw FailedToLoadDocumentException()
  }
  // At most 4M pixels / 16 MB for the rendered page, independent of source dimensions.
  let scale = min(3, min(2560 / max(width, height), sqrt(4_000_000 / (width * height))))
  let pixelWidth = max(1, Int(width * scale))
  let pixelHeight = max(1, Int(height * scale))
  guard let context = CGContext(
    data: nil, width: pixelWidth, height: pixelHeight, bitsPerComponent: 8,
    bytesPerRow: pixelWidth * 4, space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
  ) else { throw FailedToLoadDocumentException() }
  // White is the document paper, not application chrome.
  context.setFillColor(gray: 1, alpha: 1)
  context.fill(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
  // CGPDFPage.getDrawingTransform never scales up, so map the crop box and clockwise /Rotate here.
  let quarterTurn: CGAffineTransform
  switch rotation {
  case 90: quarterTurn = CGAffineTransform(a: 0, b: -1, c: 1, d: 0, tx: 0, ty: bounds.width)
  case 180: quarterTurn = CGAffineTransform(a: -1, b: 0, c: 0, d: -1, tx: bounds.width, ty: bounds.height)
  case 270: quarterTurn = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: bounds.height, ty: 0)
  default: quarterTurn = .identity
  }
  context.concatenate(
    CGAffineTransform(translationX: -bounds.minX, y: -bounds.minY)
      .concatenating(quarterTurn)
      .concatenating(CGAffineTransform(
        scaleX: CGFloat(pixelWidth) / width, y: CGFloat(pixelHeight) / height
      ))
  )
  context.clip(to: bounds)
  context.drawPDFPage(source)
  try request.checkCancellation()

  guard let data = context.data else { throw FailedToLoadDocumentException() }
  let pixels = data.assumingMemoryBound(to: UInt8.self)
  var ink = 0
  for offset in stride(from: 0, to: pixelWidth * pixelHeight * 4, by: 4) {
    if min(pixels[offset], min(pixels[offset + 1], pixels[offset + 2])) < 240 {
      ink += 1
      if ink >= 32 { break }
    }
  }
  // Blank pages are legitimate and must not make mixed documents fail.
  if ink < 32 { return PdfPageRecognition(text: "") }
  guard let image = context.makeImage() else { throw FailedToLoadDocumentException() }
  let text = try request.recognize(image, languages: languages)
  // Successful recognition with no text may be a photograph, cover or scan noise.
  return hasUsablePdfText(text) ? PdfPageRecognition(text: text)
    : PdfPageRecognition(text: "", unrecognized: true)
}

import PDFKit

internal let maxPdfTextCharacters = 1_000_000

private final class PdfImageScan {
  var hasImages = false
  var failed = false
  let depth: Int
  init(depth: Int) { self.depth = depth }
}

/// A page whose native layer holds at most a page number, header or caption. Scanned bodies keep
/// such text beside their image; a text page with a logo or figure has far more.
internal func isSparsePdfText(_ text: String) -> Bool {
  var count = 0
  for scalar in text.unicodeScalars where CharacterSet.alphanumerics.contains(scalar) {
    count += 1
    if count >= 200 { return false }
  }
  return true
}

/// Inspect drawing operators, including nested forms, without rendering ordinary text pages.
/// The scan only routes a page to OCR; content PDFKit can read must not be rejected by it.
internal func pdfPageHasImages(_ page: PDFPage) -> Bool {
  guard let source = page.pageRef else { return true }
  let stream = CGPDFContentStreamCreateWithPage(source)
  defer { CGPDFContentStreamRelease(stream) }
  return (try? scanPdfImages(stream, depth: 0)) ?? true
}

private func scanPdfImages(_ stream: CGPDFContentStreamRef, depth: Int) throws -> Bool {
  // Excessively nested forms take the conservative OCR path, rather than bypassing image content.
  if depth >= 16 { return true }
  guard let table = CGPDFOperatorTableCreate() else { throw FailedToLoadDocumentException() }
  defer { CGPDFOperatorTableRelease(table) }
  let state = PdfImageScan(depth: depth)
  // CGPDFScanner consumes BI/ID itself and reports an inline image only as EI.
  CGPDFOperatorTableSetCallback(table, "EI") { scanner, info in
    guard let info else { return }
    Unmanaged<PdfImageScan>.fromOpaque(info).takeUnretainedValue().hasImages = true
    CGPDFScannerStop(scanner)
  }
  CGPDFOperatorTableSetCallback(table, "Do") { scanner, info in
    guard let info else { return }
    let state = Unmanaged<PdfImageScan>.fromOpaque(info).takeUnretainedValue()
    var name: UnsafePointer<CChar>?
    let parent = CGPDFScannerGetContentStream(scanner)
    var objectStream: CGPDFStreamRef?
    guard CGPDFScannerPopName(scanner, &name), let name,
          let object = CGPDFContentStreamGetResource(parent, "XObject", name),
          CGPDFObjectGetValue(object, .stream, &objectStream), let objectStream else {
      state.failed = true
      CGPDFScannerStop(scanner)
      return
    }
    guard let dictionary = CGPDFStreamGetDictionary(objectStream) else {
      state.failed = true
      CGPDFScannerStop(scanner)
      return
    }
    var subtype: UnsafePointer<CChar>?
    if CGPDFDictionaryGetName(dictionary, "Subtype", &subtype), let subtype {
      if String(cString: subtype) == "Image" {
        state.hasImages = true
      } else if String(cString: subtype) == "Form" {
        var resources: CGPDFDictionaryRef?
        CGPDFDictionaryGetDictionary(dictionary, "Resources", &resources)
        let child = CGPDFContentStreamCreateWithStream(objectStream, resources ?? dictionary, parent)
        defer { CGPDFContentStreamRelease(child) }
        do {
          state.hasImages = try scanPdfImages(child, depth: state.depth + 1)
        } catch {
          state.failed = true
        }
      }
    }
    if state.hasImages || state.failed { CGPDFScannerStop(scanner) }
  }
  let scanner = CGPDFScannerCreate(stream, table, Unmanaged.passUnretained(state).toOpaque())
  defer { CGPDFScannerRelease(scanner) }
  let scanned = CGPDFScannerScan(scanner)
  if state.failed || (!scanned && !state.hasImages) { throw FailedToLoadDocumentException() }
  return state.hasImages
}

/** OCR owns visual reading order; retain native lines it missed without duplicating matching text. */
internal func mergePdfPageText(_ nativeText: String, _ recognized: String) -> String {
  if !hasUsablePdfText(nativeText) { return recognized }
  if !hasUsablePdfText(recognized) { return nativeText }
  func normalized(_ text: String) -> String {
    String(String.UnicodeScalarView(text.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }))
      .lowercased()
  }
  let recognizedKey = normalized(recognized)
  let missing = nativeText.components(separatedBy: .newlines).filter {
    let key = normalized($0)
    return !key.isEmpty && !recognizedKey.contains(key)
  }
  return ([recognized] + missing).joined(separator: "\n")
}

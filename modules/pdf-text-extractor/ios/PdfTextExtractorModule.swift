import ExpoModulesCore
import PDFKit
import os

// Expo's default AsyncFunction queue is one serial queue shared by every module.
private let extractionQueue = DispatchQueue(label: "expo.modules.PdfTextExtractor", qos: .userInitiated)

public class PdfTextExtractorModule: Module {
  private let defaultMaxPages = 100
  private let requestsLock = NSLock()
  private var requests: [String: PdfExtractionRequest] = [:]

  public func definition() -> ModuleDefinition {
    Name("PdfTextExtractor")

    Events("onProgress")

    Function("createRequest") { () -> String in
      let id = UUID().uuidString
      self.requestsLock.lock()
      self.requests[id] = PdfExtractionRequest()
      self.requestsLock.unlock()
      return id
    }
    Function("cancelRequest") { (id: String) in
      self.requestsLock.lock()
      let request = self.requests.removeValue(forKey: id)
      self.requestsLock.unlock()
      request?.cancel()
    }
    OnDestroy {
      self.requestsLock.lock()
      let active = Array(self.requests.values)
      self.requests.removeAll()
      self.requestsLock.unlock()
      active.forEach { $0.cancel() }
    }

    AsyncFunction("extractText") {
      (filePath: String, options: ExtractOptions?, requestId: String) -> [String: Any] in
      self.requestsLock.lock()
      let request = self.requests[requestId]
      self.requestsLock.unlock()
      guard let request else { throw PdfExtractionCancelledException() }
      defer {
        self.requestsLock.lock()
        self.requests.removeValue(forKey: requestId)
        self.requestsLock.unlock()
      }
      return try self.extractTextFromPDF(
        filePath: filePath, options: options, requestId: requestId, request: request
      )
    }.runOnQueue(extractionQueue)

    // 异步函数：获取 PDF 页数
    AsyncFunction("getPageCount") { (filePath: String) -> Int in
      return self.getPageCount(filePath: filePath)
    }.runOnQueue(extractionQueue)
  }

  // MARK: - PDF 文本提取核心逻辑

  private func extractTextFromPDF(
    filePath: String, options: ExtractOptions?, requestId: String, request: PdfExtractionRequest
  ) throws -> [String: Any] {
    try request.checkCancellation()
    let url = try parseFileURL(filePath)
    let didAccess = url.startAccessingSecurityScopedResource()
    defer {
      if didAccess { url.stopAccessingSecurityScopedResource() }
    }
    guard let document = PDFDocument(url: url), !document.isEncrypted else {
      throw FailedToLoadDocumentException()
    }
    let totalPages = document.pageCount
    let endPage = min(max(0, min(options?.maxPages ?? defaultMaxPages, defaultMaxPages)), totalPages)
    var pages: [String] = []
    var unrecognizedPages: [Int] = []
    var characterCount = 0
    var isTruncated = endPage < totalPages
    var extractionError = false
    var ocrError = false
    var ocrUnavailable = false
    var usedOcr = false
    var ocrLanguages: [String]??
    func languages() throws -> [String]? {
      if let resolved = ocrLanguages { return resolved }
      let resolved = try pdfOcrLanguages(for: options?.language)
      ocrLanguages = .some(resolved)
      return resolved
    }
    func progress(_ completed: Int, phase: String) throws {
      try request.checkCancellation()
      sendEvent("onProgress", [
        "requestId": requestId,
        "completedPages": completed,
        "totalPages": endPage,
        "phase": phase
      ])
    }

    for pageIndex in 0..<endPage {
      try request.checkCancellation()
      var recognizingPage = false
      do {
        let text: String = try autoreleasepool {
          guard let page = document.page(at: pageIndex) else { throw FailedToLoadDocumentException() }
          let nativeText = (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          try request.checkCancellation()
          // A page number or caption must not hide a scanned body on the same page.
          if hasUsablePdfText(nativeText)
            && (!isSparsePdfText(nativeText) || !pdfPageHasImages(page)) {
            return nativeText
          }
          recognizingPage = true
          guard let languages = try languages() else {
            // The engine cannot read this script; report image pages rather than send garbage.
            if pdfPageHasImages(page) {
              ocrUnavailable = true
              unrecognizedPages.append(pageIndex + 1)
            }
            return nativeText
          }
          usedOcr = true
          try progress(pageIndex, phase: "ocr")
          let recognized = try recognizePdfPage(page, request: request, languages: languages)
          if recognized.unrecognized { unrecognizedPages.append(pageIndex + 1) }
          return mergePdfPageText(nativeText, recognized.text)
        }
        let separatorCount = pages.isEmpty ? 0 : 2
        let remaining = max(0, maxPdfTextCharacters - characterCount - separatorCount)
        let utf16 = text as NSString
        var end = min(utf16.length, remaining)
        if end > 0 && (0xD800...0xDBFF).contains(utf16.character(at: end - 1)) { end -= 1 }
        let clipped = utf16.substring(to: end)
        let wasClipped = end < utf16.length
        if wasClipped { isTruncated = true }
        pages.append(clipped)
        characterCount += end + separatorCount
        try progress(pageIndex + 1, phase: usedOcr ? "ocr" : "text")
        if characterCount >= maxPdfTextCharacters - 2 || wasClipped {
          isTruncated = isTruncated || pageIndex + 1 < endPage
          break
        }
      } catch {
        try request.checkCancellation()
        extractionError = true
        ocrError = recognizingPage
        break
      }
    }
    try request.checkCancellation()
    return [
      "text": pages.joined(separator: "\n\n"),
      "totalPages": totalPages,
      "extractedPages": pages.count,
      "isTruncated": isTruncated,
      "extractionError": extractionError,
      "ocrError": ocrError,
      "ocrUnavailable": ocrUnavailable,
      "unrecognizedPages": unrecognizedPages
    ]
  }

  private func getPageCount(filePath: String) -> Int {
    do {
      let url = try parseFileURL(filePath)
      let didAccess = url.startAccessingSecurityScopedResource()
      defer {
        if didAccess {
          url.stopAccessingSecurityScopedResource()
        }
      }
      guard let document = PDFDocument(url: url) else {
        os_log("PdfTextExtractor: failed to load PDF at %{public}@", log: .default, type: .error, filePath)
        return 0
      }
      return document.pageCount
    } catch {
      os_log("PdfTextExtractor: getPageCount error for %{public}@: %{public}@", log: .default, type: .error, filePath, String(describing: error))
      return 0
    }
  }

  // MARK: - 辅助方法

  private func parseFileURL(_ filePath: String) throws -> URL {
    let url: URL

    if filePath.hasPrefix("file://") {
      guard let parsed = URL(string: filePath) else {
        throw InvalidFilePathException()
      }
      url = parsed
    } else {
      url = URL(fileURLWithPath: filePath)
    }

    guard FileManager.default.fileExists(atPath: url.path) else {
      throw FileNotFoundException()
    }

    return url
  }

}

// MARK: - 数据结构

struct ExtractOptions: Record {
  @Field
  var maxPages: Int?
  /// Resolved app language; selects recognition languages or disables OCR for unsupported scripts.
  @Field
  var language: String?
}

// MARK: - 错误定义


internal class InvalidFilePathException: Exception {
  override var code: String { "INVALID_FILE_PATH" }
  override var reason: String { "Invalid file path provided" }
}

internal class FileNotFoundException: Exception {
  override var code: String { "FILE_NOT_FOUND" }
  override var reason: String { "PDF file not found at the specified path" }
}

internal class FailedToLoadDocumentException: Exception {
  override var code: String { "FAILED_TO_LOAD_DOCUMENT" }
  override var reason: String { "Failed to load PDF document. The file may be corrupted or password-protected" }
}

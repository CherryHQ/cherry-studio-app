import ExpoModulesCore
import PDFKit
import UIKit
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

    AsyncFunction("readPdfPages") {
      (filePath: String, maxPages: Int, requestId: String, pageNumbers: [Int]?) -> [String: Any] in
      try self.withRequest(requestId) { request in
        let url = try self.parseFileURL(filePath)
        let didAccess = url.startAccessingSecurityScopedResource()
        defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
        guard let document = PDFDocument(url: url), !document.isEncrypted else {
          throw FailedToLoadDocumentException()
        }
        let count = min(max(0, min(maxPages, self.defaultMaxPages)), document.pageCount)
        let selected = pageNumbers ?? (0..<count).map { $0 + 1 }
        guard selected.count <= self.defaultMaxPages,
              Set(selected).count == selected.count,
              selected.allSatisfy({ $0 >= 1 && $0 <= min(document.pageCount, self.defaultMaxPages) }) else {
          throw InvalidFilePathException()
        }
        var pages: [[String: Any]] = []
        var remaining = maxPdfTextCharacters
        var truncated = pageNumbers == nil && count < document.pageCount
        for number in selected {
          let index = number - 1
          try request.checkCancellation()
          let result: [String: Any] = try autoreleasepool {
            guard let page = document.page(at: index) else { throw FailedToLoadDocumentException() }
            let text = (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let needsOcr = !hasUsablePdfText(text) || (isSparsePdfText(text) && pdfPageHasImages(page))
            let value = text as NSString
            var end = min(value.length, remaining)
            if end > 0 && (0xD800...0xDBFF).contains(value.character(at: end - 1)) { end -= 1 }
            remaining -= end
            if end < value.length { truncated = true }
            return ["page": number, "text": value.substring(to: end), "needsOcr": needsOcr,
                    "isTruncated": end < value.length]
          }
          pages.append(result)
        }
        return ["totalPages": document.pageCount, "pages": pages, "isTruncated": truncated]
      }
    }.runOnQueue(extractionQueue)

    AsyncFunction("renderPdfPage") {
      (filePath: String, pageIndex: Int, outputUri: String, requestId: String) -> Bool in
      try self.withRequest(requestId) { request in
        try autoreleasepool {
          let url = try self.parseFileURL(filePath)
          let didAccess = url.startAccessingSecurityScopedResource()
          defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
          guard let document = PDFDocument(url: url), !document.isEncrypted,
                pageIndex >= 0, pageIndex < document.pageCount,
                let page = document.page(at: pageIndex) else { throw InvalidFilePathException() }
          let destination = try self.cacheOutputURL(outputUri)
          guard let image = try renderPdfPageImage(page, request: request, maxDimension: 2048) else {
            return false
          }
          try request.checkCancellation()
          guard let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.95) else {
            throw FailedToLoadDocumentException()
          }
          try data.write(to: destination, options: .atomic)
          try request.checkCancellation()
          return true
        }
      }
    }.runOnQueue(extractionQueue)

    AsyncFunction("prepareOcrImage") { (filePath: String, outputUri: String, requestId: String) in
      try self.withRequest(requestId) { request in
        try autoreleasepool {
          let url = try self.parseFileURL(filePath)
          let didAccess = url.startAccessingSecurityScopedResource()
          defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
          let destination = try self.cacheOutputURL(outputUri)
          let image = try decodeImageForOcr(url, request: request)
          guard let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.95) else {
            throw FailedToLoadImageException()
          }
          try request.checkCancellation()
          try data.write(to: destination, options: .atomic)
          try request.checkCancellation()
        }
      }
    }.runOnQueue(extractionQueue)

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

    AsyncFunction("extractImageText") {
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
      return try autoreleasepool {
        try request.checkCancellation()
        let url = try self.parseFileURL(filePath)
        let didAccess = url.startAccessingSecurityScopedResource()
        defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
        let languages = try pdfOcrLanguages(for: options?.language)
        var text = ""
        if let languages {
          self.sendEvent("onProgress", [
            "requestId": requestId, "completedPages": 0, "totalPages": 1, "phase": "ocr"
          ])
          text = try recognizeImageFile(url, request: request, languages: languages)
        }
        try request.checkCancellation()
        if !hasUsablePdfText(text) { text = "" }
        let value = text as NSString
        var end = min(value.length, maxPdfTextCharacters)
        if end > 0 && (0xD800...0xDBFF).contains(value.character(at: end - 1)) { end -= 1 }
        return [
          "text": value.substring(to: end), "totalPages": 1, "extractedPages": 1,
          "isTruncated": end < value.length, "extractionError": false, "ocrError": false,
          "ocrUnavailable": languages == nil, "unrecognizedPages": text.isEmpty ? [1] : []
        ]
      }
    }.runOnQueue(extractionQueue)
  }

  // MARK: - PDF 文本提取核心逻辑

  private func withRequest<T>(_ id: String, work: (PdfExtractionRequest) throws -> T) throws -> T {
    requestsLock.lock()
    let request = requests[id]
    requestsLock.unlock()
    guard let request else { throw PdfExtractionCancelledException() }
    defer {
      requestsLock.lock()
      requests.removeValue(forKey: id)
      requestsLock.unlock()
    }
    try request.checkCancellation()
    let result = try work(request)
    try request.checkCancellation()
    return result
  }

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

  // MARK: - 辅助方法

  private func cacheOutputURL(_ uri: String) throws -> URL {
    let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
    guard let destination = URL(string: uri), destination.isFileURL,
          destination.standardizedFileURL.path.hasPrefix(cache.standardizedFileURL.path + "/") else {
      throw InvalidFilePathException()
    }
    return destination
  }

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

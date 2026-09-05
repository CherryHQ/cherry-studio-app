import ExpoModulesCore
import PDFKit
import os

public class PdfTextExtractorModule: Module {
  private let defaultMaxPages = 100

  public func definition() -> ModuleDefinition {
    Name("PdfTextExtractor")

    // 异步函数：提取 PDF 文本
    AsyncFunction("extractText") { (filePath: String, options: ExtractOptions?) -> [String: Any] in
      return try self.extractTextFromPDF(filePath: filePath, options: options)
    }

    // 异步函数：获取 PDF 页数
    AsyncFunction("getPageCount") { (filePath: String) -> Int in
      return self.getPageCount(filePath: filePath)
    }
  }

  // MARK: - PDF 文本提取核心逻辑

  private func extractTextFromPDF(filePath: String, options: ExtractOptions?) throws -> [String: Any] {
    let url = try parseFileURL(filePath)
    let didAccess = url.startAccessingSecurityScopedResource()
    defer {
      if didAccess {
        url.stopAccessingSecurityScopedResource()
      }
    }

    guard let document = PDFDocument(url: url) else {
      throw FailedToLoadDocumentException()
    }

    if document.isEncrypted {
      throw FailedToLoadDocumentException()
    }

    let totalPages = document.pageCount

    let maxPages = options?.maxPages ?? defaultMaxPages
    let endPage = min(maxPages, totalPages)
    let isTruncated = endPage < totalPages

    var extractedText = ""
    var extractionError = false

    for pageIndex in 0..<endPage {
      autoreleasepool {
        if let page = document.page(at: pageIndex) {
          if let pageText = page.string {
            if !extractedText.isEmpty {
              extractedText += "\n"
            }
            extractedText += pageText
          }
        } else {
          extractionError = true
        }
      }
    }

    return [
      "text": extractedText,
      "totalPages": totalPages,
      "extractedPages": endPage,
      "isTruncated": isTruncated,
      "extractionError": extractionError
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

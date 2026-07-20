import ExpoModulesCore
import PDFKit

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
    // 1. 解析文件路径
    let url = try parseFileURL(filePath)

    // 2. 加载 PDF 文档
    guard let document = PDFDocument(url: url) else {
      throw PdfExtractorError.failedToLoadDocument
    }

    let totalPages = document.pageCount

    // 3. 确定提取范围
    let maxPages = options?.maxPages ?? defaultMaxPages
    let endPage = min(maxPages, totalPages)
    let isTruncated = endPage < totalPages

    // 4. 提取文本
    var extractedText = ""
    var extractedPages = 0
    var extractionError = false

    for pageIndex in 0..<endPage {
      guard let page = document.page(at: pageIndex) else {
        extractionError = true
        continue
      }

      if let pageText = page.string {
        if !extractedText.isEmpty {
          extractedText += "\n"
        }
        extractedText += pageText
        extractedPages += 1
      }
    }

    // 5. 返回结果
    return [
      "text": extractedText,
      "totalPages": totalPages,
      "extractedPages": extractedPages,
      "isTruncated": isTruncated,
      "extractionError": extractionError
    ]
  }

  private func getPageCount(filePath: String) -> Int {
    guard let url = try? parseFileURL(filePath),
          let document = PDFDocument(url: url) else {
      return 0
    }
    return document.pageCount
  }

  // MARK: - 辅助方法

  private func parseFileURL(_ filePath: String) throws -> URL {
    // 处理 file:// 协议
    if filePath.hasPrefix("file://") {
      guard let url = URL(string: filePath) else {
        throw PdfExtractorError.invalidFilePath
      }
      return url
    }

    // 处理普通路径
    let url = URL(fileURLWithPath: filePath)

    // 验证文件存在
    guard FileManager.default.fileExists(atPath: url.path) else {
      throw PdfExtractorError.fileNotFound
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

enum PdfExtractorError: Error {
  case invalidFilePath
  case fileNotFound
  case failedToLoadDocument
}

extension PdfExtractorError: LocalizedError {
  var errorDescription: String? {
    switch self {
    case .invalidFilePath:
      return "Invalid file path provided"
    case .fileNotFound:
      return "PDF file not found at the specified path"
    case .failedToLoadDocument:
      return "Failed to load PDF document. The file may be corrupted or password-protected"
    }
  }
}

package expo.modules.pdftextextractor

import android.content.Context
import android.net.Uri
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File

class ExtractOptions : Record {
    @Field
    val maxPages: Int? = null
}

class InvalidFilePathException : CodedException(
    "INVALID_FILE_PATH",
    "Invalid file path provided",
    null
)

class FileNotFoundException : CodedException(
    "FILE_NOT_FOUND",
    "PDF file not found at the specified path",
    null
)

class FailedToLoadDocumentException : CodedException(
    "FAILED_TO_LOAD_DOCUMENT",
    "Failed to load PDF document. The file may be corrupted or password-protected",
    null
)

class FailedToGetPageCountException : CodedException(
    "FAILED_TO_GET_PAGE_COUNT",
    "Failed to get PDF page count. The file may be corrupted or inaccessible",
    null
)

class PdfTextExtractorModule : Module() {
    private val defaultMaxPages = 100
    private var isInitialized = false

    private val context: Context
        get() = requireNotNull(appContext.reactContext)

    override fun definition() = ModuleDefinition {
        Name("PdfTextExtractor")

        OnCreate {
            initializePdfBox()
        }

        AsyncFunction("extractText") { filePath: String, options: ExtractOptions?, promise: Promise ->
            try {
                val result = extractTextFromPDF(filePath, options)
                promise.resolve(result)
            } catch (e: CodedException) {
                promise.reject(e)
            } catch (e: Exception) {
                promise.reject(FailedToLoadDocumentException())
            }
        }

        AsyncFunction("getPageCount") { filePath: String, promise: Promise ->
            try {
                val result = getPageCount(filePath)
                promise.resolve(result)
            } catch (e: CodedException) {
                promise.reject(e)
            } catch (e: Exception) {
                promise.reject(FailedToGetPageCountException())
            }
        }
    }

    private fun initializePdfBox() {
        if (!isInitialized) {
            PDFBoxResourceLoader.init(context)
            isInitialized = true
        }
    }

    private fun extractTextFromPDF(filePath: String, options: ExtractOptions?): Map<String, Any> {
        val file = parseFilePath(filePath)
        val isTempFile = filePath.startsWith("content://")

        try {
            val document: PDDocument = try {
                PDDocument.load(file)
            } catch (e: Exception) {
                throw FailedToLoadDocumentException()
            }

            return document.use { doc ->
                val totalPages = doc.numberOfPages

                val maxPages = options?.maxPages ?: defaultMaxPages
                val endPage = minOf(maxPages, totalPages)
                val isTruncated = endPage < totalPages

                val stripper = PDFTextStripper().apply {
                    startPage = 1
                    this.endPage = endPage
                }

                var extractionError = false
                val extractedText = try {
                    stripper.getText(doc)
                } catch (e: Exception) {
                    android.util.Log.w("PdfTextExtractor", "Failed to extract text from PDF", e)
                    extractionError = true
                    ""
                }

                mapOf(
                    "text" to extractedText,
                    "totalPages" to totalPages,
                    "extractedPages" to endPage,
                    "isTruncated" to isTruncated,
                    "extractionError" to extractionError
                )
            }
        } finally {
            // 清理临时文件
            if (isTempFile && file.exists()) {
                file.delete()
            }
        }
    }

    private fun getPageCount(filePath: String): Int {
        val isTempFile = filePath.startsWith("content://")
        val file = parseFilePath(filePath)

        return try {
            PDDocument.load(file).use { doc ->
                doc.numberOfPages
            }
        } finally {
            // 清理临时文件
            if (isTempFile && file.exists()) {
                file.delete()
            }
        }
    }

    private fun parseFilePath(filePath: String): File {
        val file = when {
            filePath.startsWith("file://") -> {
                val uri = Uri.parse(filePath)
                File(uri.path ?: throw InvalidFilePathException())
            }
            filePath.startsWith("content://") -> {
                val uri = Uri.parse(filePath)
                copyContentUriToTempFile(uri)
            }
            else -> File(filePath)
        }

        if (!file.exists()) {
            throw FileNotFoundException()
        }

        return file
    }

    private fun copyContentUriToTempFile(uri: Uri): File {
        val inputStream = context.contentResolver.openInputStream(uri)
            ?: throw InvalidFilePathException()

        val tempFile = File.createTempFile("pdf_temp_", ".pdf", context.cacheDir)

        inputStream.use { input ->
            tempFile.outputStream().use { output ->
                input.copyTo(output)
            }
        }

        return tempFile
    }
}

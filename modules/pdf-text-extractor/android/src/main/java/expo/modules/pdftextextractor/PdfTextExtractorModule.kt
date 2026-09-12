package expo.modules.pdftextextractor

import android.content.Context
import android.net.Uri
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
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

class InvalidFilePathException(cause: Throwable? = null) : CodedException(
    "INVALID_FILE_PATH",
    "Invalid file path provided",
    cause
)

class FileNotFoundException(cause: Throwable? = null) : CodedException(
    "FILE_NOT_FOUND",
    "PDF file not found at the specified path",
    cause
)

class FailedToLoadDocumentException(cause: Throwable? = null) : CodedException(
    "FAILED_TO_LOAD_DOCUMENT",
    "Failed to load PDF document. The file may be corrupted or password-protected",
    cause
)

class PdfTextExtractorModule : Module() {
    private val defaultMaxPages = 100
    @Volatile
    private var isInitialized = false

    private val context: Context
        get() = requireNotNull(appContext.reactContext)

    override fun definition() = ModuleDefinition {
        Name("PdfTextExtractor")

        OnCreate {
            initializePdfBox()
        }

        AsyncFunction("extractText") { filePath: String, options: ExtractOptions? ->
            extractTextFromPDF(filePath, options)
        }

        AsyncFunction("getPageCount") { filePath: String ->
            getPageCount(filePath)
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
                throw FailedToLoadDocumentException(e)
            }

            return document.use { doc ->
                val totalPages = doc.numberOfPages

                val maxPages = options?.maxPages ?: defaultMaxPages
                val endPage = minOf(maxPages, totalPages)
                val isTruncated = endPage < totalPages
                if (totalPages == 0) {
                    return mapOf(
                        "text" to "",
                        "totalPages" to 0,
                        "extractedPages" to 0,
                        "isTruncated" to false,
                        "extractionError" to false
                    )
                }

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
            if (isTempFile && file.exists()) {
                file.delete()
            }
        }
    }

    private fun getPageCount(filePath: String): Int {
        return try {
            val isTempFile = filePath.startsWith("content://")
            val file = parseFilePath(filePath)
            try {
                PDDocument.load(file).use { doc ->
                    doc.numberOfPages
                }
            } finally {
                if (isTempFile && file.exists()) {
                    file.delete()
                }
            }
        } catch (e: Exception) {
            0
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
        val tempFile = File.createTempFile("pdf_temp_", ".pdf", context.cacheDir)

        try {
            val inputStream = context.contentResolver.openInputStream(uri)
                ?: throw InvalidFilePathException()
            inputStream.use { input ->
                tempFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }
        } catch (e: Exception) {
            if (tempFile.exists()) {
                tempFile.delete()
            }
            throw e
        }

        return tempFile
    }
}

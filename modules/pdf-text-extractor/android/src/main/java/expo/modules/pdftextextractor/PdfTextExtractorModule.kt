package expo.modules.pdftextextractor

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.contentstream.operator.Operator
import com.tom_roush.pdfbox.cos.COSBase
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

class ExtractOptions : Record {
    @Field
    val maxPages: Int? = null

    /** Resolved app language; OCR is disabled for scripts the bundled recognizer cannot read. */
    @Field
    val language: String? = null
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

internal open class StrictPdfTextStripper : PDFTextStripper() {
    override fun operatorException(
        operator: Operator,
        operands: MutableList<COSBase>,
        exception: IOException
    ) {
        // PDFBox swallows I/O failures in Form XObjects (Do), including scratch-budget
        // exhaustion. Propagate them so the caller can reject incomplete extraction.
        throw exception
    }
}

class PdfTextExtractorModule : Module() {
    private val defaultMaxPages = 100
    private val maxStreamMemoryBytes = 16 * 1024 * 1024L
    private val maxStreamStorageBytes = 128 * 1024 * 1024L
    private val documentMutex = Mutex()
    private val requests = ConcurrentHashMap<String, AtomicBoolean>()
    @Volatile
    private var isInitialized = false

    private val context: Context
        get() = requireNotNull(appContext.reactContext)

    override fun definition() = ModuleDefinition {
        Name("PdfTextExtractor")
        Events("onProgress")

        Function("createRequest") {
            val id = UUID.randomUUID().toString()
            requests[id] = AtomicBoolean(false)
            id
        }
        Function("cancelRequest") { id: String ->
            requests.remove(id)?.set(true)
        }
        OnDestroy {
            requests.values.forEach { it.set(true) }
            requests.clear()
        }

        OnCreate {
            initializePdfBox()
        }

        AsyncFunction("readPdfPages") Coroutine { filePath: String, maxPages: Int, requestId: String, pageNumbers: List<Int>? ->
            withRequestFile(filePath, requestId) { file, checkCancelled ->
                loadDocument(file).use { doc ->
                    if (doc.isEncrypted) throw FailedToLoadDocumentException()
                    val count = minOf(maxPages.coerceIn(0, defaultMaxPages), doc.numberOfPages)
                    val selected = pageNumbers ?: (1..count).toList()
                    if (selected.size > defaultMaxPages || selected.distinct().size != selected.size ||
                        selected.any { it < 1 || it > minOf(doc.numberOfPages, defaultMaxPages) }) throw InvalidFilePathException()
                    val result = readPdfTextPages(doc, count, selected, checkCancelled)
                    mapOf(
                        "totalPages" to doc.numberOfPages,
                        "isTruncated" to ((pageNumbers == null && count < doc.numberOfPages) || result.truncated),
                        "pages" to result.pages.mapIndexed { index, page ->
                            mapOf(
                                "page" to selected[index],
                                "isTruncated" to page.truncated,
                                "text" to page.text,
                                "needsOcr" to (!hasUsablePdfText(page.text) ||
                                    (page.hasImages && isSparsePdfText(page.text)))
                            )
                        }
                    )
                }
            }
        }

        AsyncFunction("renderPdfPage") Coroutine {
            filePath: String, pageIndex: Int, outputUri: String, requestId: String ->
            withRequestFile(filePath, requestId) { file, checkCancelled ->
                val output = cacheOutputFile(outputUri)
                PdfPageOcr(file).use { it.renderToFile(pageIndex, output, checkCancelled) }
            }
        }

        AsyncFunction("prepareOcrImage") Coroutine { filePath: String, outputUri: String, requestId: String ->
            withRequestFile(filePath, requestId) { file, checkCancelled ->
                val output = cacheOutputFile(outputUri)
                val bitmap = decodeImageForOcr(file, checkCancelled)
                try {
                    output.outputStream().use {
                        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it))
                            throw IOException("Image encoding failed")
                    }
                    checkCancelled()
                } finally {
                    bitmap.recycle()
                }
            }
        }

        // Plain AsyncFunctions share one serial thread with every Expo module.
        AsyncFunction("extractText") Coroutine { filePath: String, options: ExtractOptions?, requestId: String ->
            val cancelled = requests[requestId] ?: throw PdfExtractionCancelledException()
            try {
                withContext(Dispatchers.IO) {
                    documentMutex.withLock {
                        extractTextFromPDF(filePath, options, requestId, cancelled)
                    }
                }
            } finally {
                requests.remove(requestId)
            }
        }

        AsyncFunction("extractImageText") Coroutine { filePath: String, options: ExtractOptions?, requestId: String ->
            val cancelled = requests[requestId] ?: throw PdfExtractionCancelledException()
            fun checkCancelled() {
                if (cancelled.get()) throw PdfExtractionCancelledException()
            }
            try {
                withContext(Dispatchers.IO) {
                    documentMutex.withLock {
                        checkCancelled()
                        val file = parseFilePath(filePath)
                        try {
                            val supported = isPdfOcrLanguageSupported(options?.language)
                            val text = if (supported) {
                                sendEvent("onProgress", mapOf(
                                    "requestId" to requestId, "completedPages" to 0,
                                    "totalPages" to 1, "phase" to "ocr"
                                ))
                                recognizeImageFile(file, ::checkCancelled).let {
                                    if (hasUsablePdfText(it)) it else ""
                                }
                            } else ""
                            checkCancelled()
                            var end = minOf(text.length, MAX_PDF_TEXT_CHARACTERS)
                            if (end > 0 && text[end - 1].isHighSurrogate()) end--
                            mapOf(
                                "text" to text.substring(0, end), "totalPages" to 1,
                                "extractedPages" to 1, "isTruncated" to (end < text.length),
                                "extractionError" to false, "ocrError" to false,
                                "ocrUnavailable" to !supported,
                                "unrecognizedPages" to if (text.isEmpty()) listOf(1) else emptyList<Int>()
                            )
                        } finally {
                            if (filePath.startsWith("content://")) file.delete()
                        }
                    }
                }
            } finally {
                requests.remove(requestId)
            }
        }
    }

    private fun initializePdfBox() {
        if (!isInitialized) {
            PDFBoxResourceLoader.init(context)
            isInitialized = true
        }
    }

    private suspend fun <T> withRequestFile(
        filePath: String, requestId: String, work: (File, () -> Unit) -> T
    ): T {
        val cancelled = requests[requestId] ?: throw PdfExtractionCancelledException()
        fun checkCancelled() { if (cancelled.get()) throw PdfExtractionCancelledException() }
        try {
            return withContext(Dispatchers.IO) {
                documentMutex.withLock {
                    checkCancelled()
                    val file = parseFilePath(filePath)
                    try {
                        val result = work(file, ::checkCancelled)
                        checkCancelled()
                        result
                    } finally {
                        if (filePath.startsWith("content://")) file.delete()
                    }
                }
            }
        } finally {
            requests.remove(requestId)
        }
    }

    private fun extractTextFromPDF(
        filePath: String,
        options: ExtractOptions?,
        requestId: String,
        cancelled: AtomicBoolean
    ): Map<String, Any> {
        fun checkCancelled() {
            if (cancelled.get()) throw PdfExtractionCancelledException()
        }
        checkCancelled()
        val file = parseFilePath(filePath)
        val isTempFile = filePath.startsWith("content://")
        try {
            val document = try {
                loadDocument(file)
            } catch (e: Exception) {
                throw FailedToLoadDocumentException(e)
            }
            return document.use { doc ->
                if (doc.isEncrypted) throw FailedToLoadDocumentException()
                val totalPages = doc.numberOfPages
                val endPage = minOf(
                    (options?.maxPages ?: defaultMaxPages).coerceIn(0, defaultMaxPages), totalPages
                )
                // One PDFBox traversal, with page boundaries and image operators retained.
                val nativePages = readPdfTextPages(doc, endPage, checkCancelled = ::checkCancelled)
                val pages = mutableListOf<String>()
                val unrecognizedPages = mutableListOf<Int>()
                var characterCount = 0
                var isTruncated = endPage < totalPages || nativePages.truncated
                var extractionError = false
                var ocrError = false
                var ocrUnavailable = false
                var ocr: PdfPageOcr? = null
                val ocrSupported = isPdfOcrLanguageSupported(options?.language)
                fun progress(completed: Int, phase: String) {
                    checkCancelled()
                    sendEvent(
                        "onProgress",
                        mapOf(
                            "requestId" to requestId,
                            "completedPages" to completed,
                            "totalPages" to endPage,
                            "phase" to phase
                        )
                    )
                }
                try {
                    for (pageIndex in 0 until endPage) {
                        checkCancelled()
                        var recognizingPage = false
                        try {
                            val nativePage = nativePages.pages[pageIndex]
                            val nativeText = nativePage.text
                            checkCancelled()
                            val hasNativeBody = hasUsablePdfText(nativeText) &&
                                (!nativePage.hasImages || !isSparsePdfText(nativeText))
                            val text = if (hasNativeBody) nativeText else if (!ocrSupported) {
                                // The recognizer cannot read this script; report image pages instead.
                                if (nativePage.hasImages) {
                                    ocrUnavailable = true
                                    unrecognizedPages.add(pageIndex + 1)
                                }
                                nativeText
                            } else {
                                recognizingPage = true
                                progress(pageIndex, "ocr")
                                val reader = ocr ?: PdfPageOcr(file).also { ocr = it }
                                val recognized = reader.read(pageIndex, ::checkCancelled)
                                if (recognized.unrecognized) unrecognizedPages.add(pageIndex + 1)
                                mergePdfPageText(nativeText, recognized.text)
                            }
                            val remaining = MAX_PDF_TEXT_CHARACTERS - characterCount - if (pages.isEmpty()) 0 else 2
                            if (text.length > remaining) isTruncated = true
                            var end = minOf(text.length, remaining.coerceAtLeast(0))
                            if (end > 0 && text[end - 1].isHighSurrogate()) end--
                            pages.add(text.substring(0, end))
                            characterCount += end + if (pages.size == 1) 0 else 2
                            progress(pageIndex + 1, if (ocr == null) "text" else "ocr")
                            if (characterCount >= MAX_PDF_TEXT_CHARACTERS - 2 || end < text.length) {
                                isTruncated = isTruncated || pageIndex + 1 < endPage
                                break
                            }
                        } catch (e: Exception) {
                            checkCancelled()
                            // Never substitute OCR for corrupt native content or send a partial result.
                            extractionError = true
                            ocrError = recognizingPage
                            break
                        }
                    }
                } finally {
                    ocr?.close()
                }
                checkCancelled()
                mapOf(
                    "text" to pages.joinToString("\n\n"),
                    "totalPages" to totalPages,
                    "extractedPages" to pages.size,
                    "isTruncated" to isTruncated,
                    "extractionError" to extractionError,
                    "ocrError" to ocrError,
                    "ocrUnavailable" to ocrUnavailable,
                    "unrecognizedPages" to unrecognizedPages
                )
            }
        } finally {
            if (isTempFile) file.delete()
        }
    }

    private fun loadDocument(file: File): PDDocument {
        // Spill PDF stream buffers into the cache instead of retaining them all in RAM.
        // This bounds scratch storage, not every parsed object or the extracted text.
        val memoryUsage = MemoryUsageSetting
            .setupMixed(maxStreamMemoryBytes, maxStreamStorageBytes)
            .setTempDir(context.cacheDir)
        return PDDocument.load(file, memoryUsage)
    }

    private fun cacheOutputFile(outputUri: String): File {
        val uri = Uri.parse(outputUri)
        if (uri.scheme != "file") throw InvalidFilePathException()
        val output = File(uri.path ?: throw InvalidFilePathException()).canonicalFile
        if (!output.path.startsWith(context.cacheDir.canonicalPath + File.separator))
            throw InvalidFilePathException()
        return output
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

package expo.modules.pdftextextractor

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.icu.util.ULocale
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.exception.CodedException
import java.io.Closeable
import java.io.File
import java.io.IOException
import kotlin.math.min
import kotlin.math.sqrt

internal class PdfExtractionCancelledException : CodedException(
    "PDF_EXTRACTION_CANCELLED", "PDF extraction cancelled", null
)

internal fun hasUsablePdfText(text: String): Boolean =
    text.any { !it.isWhitespace() && !it.isISOControl() && it != '\uFFFD' } &&
        !text.contains('\uFFFD')

/**
 * The bundled recognizer reads Chinese and Latin only. Another script, such as Cyrillic, Greek or
 * Japanese kana, yields plausible garbage rather than an error, so those languages skip OCR.
 */
internal fun isPdfOcrLanguageSupported(language: String?): Boolean =
    language == null ||
        ULocale.addLikelySubtags(ULocale.forLanguageTag(language)).script in setOf("Latn", "Hans", "Hant")

internal data class PdfPageRecognition(val text: String, val unrecognized: Boolean = false)

/** One document owns the renderer and recognizer; only one bounded bitmap is alive at a time. */
internal class PdfPageOcr(file: File) : Closeable {
    private val renderer: PdfRenderer
    private var recognizer: ImageTextRecognizer? = null

    init {
        val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        try {
            // PdfRenderer owns the descriptor after construction succeeds.
            renderer = PdfRenderer(descriptor)
        } catch (error: Exception) {
            descriptor.close()
            throw error
        }
    }

    fun read(pageIndex: Int, checkCancelled: () -> Unit): PdfPageRecognition {
        checkCancelled()
        val bitmap = render(pageIndex)
        try {
            checkCancelled()
            if (!hasVisibleContent(bitmap)) return PdfPageRecognition("")
            val reader = recognizer ?: ImageTextRecognizer().also { recognizer = it }
            val text = reader.read(bitmap, checkCancelled)
            return if (hasUsablePdfText(text)) PdfPageRecognition(text)
                else PdfPageRecognition("", unrecognized = true)
        } finally {
            bitmap.recycle()
        }
    }

    /** False denotes a blank page; callers own the temporary JPEG's lifetime. */
    fun renderToFile(pageIndex: Int, output: File, checkCancelled: () -> Unit): Boolean {
        checkCancelled()
        val bitmap = render(pageIndex, 2048.0)
        try {
            checkCancelled()
            if (!hasVisibleContent(bitmap)) return false
            output.outputStream().use {
                if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it))
                    throw IOException("PDF page encoding failed")
            }
            checkCancelled()
            return true
        } finally {
            bitmap.recycle()
        }
    }

    private fun render(pageIndex: Int, maxDimension: Double = 2560.0): Bitmap =
        renderer.openPage(pageIndex).use { page ->
            val width = page.width.toDouble()
            val height = page.height.toDouble()
            if (width <= 0 || height <= 0) throw IOException("Invalid PDF page dimensions")
            val scale = min(
                3.0, min(maxDimension / maxOf(width, height), sqrt(4_000_000.0 / (width * height)))
            )
            Bitmap.createBitmap(
                (width * scale).toInt().coerceAtLeast(1),
                (height * scale).toInt().coerceAtLeast(1),
                Bitmap.Config.ARGB_8888
            ).also { image ->
                try {
                    image.eraseColor(Color.WHITE)
                    page.render(image, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                } catch (error: Exception) {
                    image.recycle()
                    throw error
                }
            }
        }

    private fun hasVisibleContent(bitmap: Bitmap): Boolean {
        val row = IntArray(bitmap.width)
        var ink = 0
        for (y in 0 until bitmap.height) {
            bitmap.getPixels(row, 0, bitmap.width, 0, y, bitmap.width, 1)
            for (pixel in row) {
                if (minOf(Color.red(pixel), Color.green(pixel), Color.blue(pixel)) < 240) {
                    if (++ink >= 32) return true
                }
            }
        }
        return false
    }

    override fun close() {
        try {
            recognizer?.close()
        } finally {
            renderer.close()
        }
    }
}

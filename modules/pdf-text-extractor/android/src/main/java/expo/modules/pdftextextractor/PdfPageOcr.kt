package expo.modules.pdftextextractor

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
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

internal data class PdfPageRecognition(val text: String, val unrecognized: Boolean = false)

/** One document owns the renderer and recognizer; only one bounded bitmap is alive at a time. */
internal class PdfPageOcr(file: File) : Closeable {
    private val renderer: PdfRenderer
    private var recognizer: TextRecognizer? = null

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
        val bitmap = renderer.openPage(pageIndex).use { page ->
            val width = page.width.toDouble()
            val height = page.height.toDouble()
            if (width <= 0 || height <= 0) throw IOException("Invalid PDF page dimensions")
            val scale = min(
                3.0, min(2560.0 / maxOf(width, height), sqrt(4_000_000.0 / (width * height)))
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
        try {
            checkCancelled()
            if (!hasVisibleContent(bitmap)) return PdfPageRecognition("")
            val reader = recognizer ?: TextRecognition.getClient(
                ChineseTextRecognizerOptions.Builder().build()
            ).also { recognizer = it }
            // ML Kit does not cancel an in-flight recognition task. Keep its bitmap alive until
            // completion, then honor cancellation before processing another page.
            val text = Tasks.await(reader.process(InputImage.fromBitmap(bitmap, 0))).text.trim()
            checkCancelled()
            // A successful OCR call with no text may be a photograph, cover or scan noise.
            return if (hasUsablePdfText(text)) PdfPageRecognition(text)
                else PdfPageRecognition("", unrecognized = true)
        } finally {
            bitmap.recycle()
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

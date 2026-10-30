package expo.modules.pdftextextractor

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.PorterDuff
import android.media.ExifInterface
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import java.io.Closeable
import java.io.File
import java.io.IOException
import kotlin.math.ceil

/** Shared bundled recognizer for PDF pages and standalone images. */
internal class ImageTextRecognizer : Closeable {
    private val reader = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())

    fun read(bitmap: Bitmap, checkCancelled: () -> Unit): String {
        checkCancelled()
        // ML Kit cannot cancel an in-flight call; keep its bitmap alive until it settles.
        val text = Tasks.await(reader.process(InputImage.fromBitmap(bitmap, 0))).text.trim()
        checkCancelled()
        return text
    }

    override fun close() = reader.close()
}

internal fun recognizeImageFile(file: File, checkCancelled: () -> Unit): String {
    val bitmap = decodeImageForOcr(file, checkCancelled)
    try {
        return ImageTextRecognizer().use { it.read(bitmap, checkCancelled) }
    } finally {
        bitmap.recycle()
    }
}

/** Decode only a bounded first frame; camera orientation includes mirrored EXIF variants. */
internal fun decodeImageForOcr(file: File, checkCancelled: () -> Unit): Bitmap {
    checkCancelled()
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, options)
    if (options.outWidth <= 0 || options.outHeight <= 0) throw IOException("Invalid image dimensions")
    var sample = 1
    while (true) {
        val width = ceil(options.outWidth.toDouble() / sample)
        val height = ceil(options.outHeight.toDouble() / sample)
        if (maxOf(width, height) <= 2560 && width * height <= 4_000_000) break
        sample *= 2
    }
    options.inJustDecodeBounds = false
    options.inSampleSize = sample
    options.inMutable = true
    options.inPreferredConfig = Bitmap.Config.ARGB_8888
    var bitmap = BitmapFactory.decodeFile(file.absolutePath, options)
        ?: throw IOException("Failed to decode image")
    try {
        checkCancelled()
        if (bitmap.hasAlpha()) Canvas(bitmap).drawColor(Color.WHITE, PorterDuff.Mode.DST_OVER)
        val orientation = try {
            ExifInterface(file.absolutePath).getAttributeInt(
                ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL
            )
        } catch (_: IOException) {
            ExifInterface.ORIENTATION_NORMAL
        }
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> {
                matrix.setRotate(90f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> {
                matrix.setRotate(-90f)
                matrix.postScale(-1f, 1f)
            }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(-90f)
        }
        if (!matrix.isIdentity) {
            val oriented = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (oriented !== bitmap) bitmap.recycle()
            bitmap = oriented
        }
        checkCancelled()
        return bitmap
    } catch (error: Throwable) {
        bitmap.recycle()
        throw error
    }
}

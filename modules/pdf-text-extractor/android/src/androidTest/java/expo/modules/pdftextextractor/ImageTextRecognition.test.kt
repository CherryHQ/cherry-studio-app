package expo.modules.pdftextextractor

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.media.ExifInterface
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.junit.Assert.*
import org.junit.Test

class ImageTextRecognitionTest {
    private fun image(width: Int, height: Int, format: Bitmap.CompressFormat, draw: (Canvas) -> Unit): File {
        val file = File.createTempFile("image-ocr-", ".image", InstrumentationRegistry.getInstrumentation().targetContext.cacheDir)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        try {
            draw(Canvas(bitmap))
            file.outputStream().use { bitmap.compress(format, 100, it) }
        } finally {
            bitmap.recycle()
        }
        return file
    }

    @Test
    fun boundsDecodeAndCompositesTransparencyOnWhite() {
        val file = image(6000, 1000, Bitmap.CompressFormat.PNG) { }
        try {
            val bitmap = decodeImageForOcr(file) {}
            try {
                assertTrue(maxOf(bitmap.width, bitmap.height) <= 2560)
                assertTrue(bitmap.width.toLong() * bitmap.height <= 4_000_000)
                assertEquals(Color.WHITE, bitmap.getPixel(0, 0))
            } finally { bitmap.recycle() }
        } finally { file.delete() }
    }

    @Test
    fun appliesExifOrientationBeforeRecognition() {
        val file = image(120, 60, Bitmap.CompressFormat.JPEG) { canvas ->
            canvas.drawColor(Color.WHITE)
            canvas.drawRect(0f, 0f, 60f, 60f, Paint().apply { color = Color.RED })
        }
        try {
            ExifInterface(file.absolutePath).apply {
                setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_ROTATE_90.toString())
                saveAttributes()
            }
            val bitmap = decodeImageForOcr(file) {}
            try {
                assertEquals(60, bitmap.width)
                assertEquals(120, bitmap.height)
                assertTrue(Color.green(bitmap.getPixel(30, 20)) < 30)
                assertTrue(Color.green(bitmap.getPixel(30, 100)) > 230)
            } finally { bitmap.recycle() }
        } finally { file.delete() }
    }

    @Test
    fun recognizesAnImageWithTheBundledModel() {
        val file = image(1200, 300, Bitmap.CompressFormat.PNG) { canvas ->
            canvas.drawColor(Color.WHITE)
            canvas.drawText("CHERRY OCR 123", 80f, 160f, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.BLACK
                textSize = 64f
            })
        }
        try {
            assertTrue(recognizeImageFile(file) {}.contains("CHERRY OCR 123"))
        } finally { file.delete() }
    }
}

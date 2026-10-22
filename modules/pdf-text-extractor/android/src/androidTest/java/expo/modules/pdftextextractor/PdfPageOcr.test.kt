package expo.modules.pdftextextractor

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Native acceptance fixtures for the bundled recognizer. */
@RunWith(AndroidJUnit4::class)
class PdfPageOcrTest {
    private lateinit var pdf: File

    @Before
    fun createMixedPdf() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        PDFBoxResourceLoader.init(context)
        pdf = File.createTempFile("pdf_ocr_", ".pdf", context.cacheDir)
        val scan = Bitmap.createBitmap(1200, 600, Bitmap.Config.ARGB_8888)
        try {
            val canvas = Canvas(scan)
            canvas.drawColor(Color.WHITE)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.BLACK; textSize = 64f }
            canvas.drawText("CHERRY OCR 123", 100f, 160f, paint)
            canvas.drawText("中文扫描文档", 100f, 300f, paint)
            PDDocument().use { document ->
                val nativePage = PDPage(PDRectangle(600f, 300f))
                document.addPage(nativePage)
                PDPageContentStream(document, nativePage).use { content ->
                    content.beginText()
                    content.setFont(PDType1Font.HELVETICA, 24f)
                    content.newLineAtOffset(50f, 100f)
                    content.showText("Native page")
                    content.endText()
                }
                val scannedPage = PDPage(PDRectangle(600f, 300f))
                document.addPage(scannedPage)
                PDPageContentStream(document, scannedPage).use { content ->
                    content.drawImage(LosslessFactory.createFromImage(document, scan), 0f, 0f, 600f, 300f)
                }
                document.addPage(PDPage(PDRectangle(600f, 300f)))
                document.save(pdf)
            }
        } finally {
            scan.recycle()
        }
    }

    @After
    fun cleanup() {
        if (::pdf.isInitialized) pdf.delete()
    }

    @Test
    fun nativeTextSelectsOnlyTheTextPage() {
        PDDocument.load(pdf).use { document ->
            val stripper = StrictPdfTextStripper()
            stripper.startPage = 1
            stripper.endPage = 1
            assertTrue(hasUsablePdfText(stripper.getText(document)))
            stripper.startPage = 2
            stripper.endPage = 2
            assertFalse(hasUsablePdfText(stripper.getText(document)))
            assertFalse(hasUsablePdfText("\uFFFD\uFFFD"))
        }
    }

    @Test
    fun bundledRecognizerReadsScansAndAllowsBlankPages() {
        PdfPageOcr(pdf).use { ocr ->
            val text = ocr.read(1) {}
            assertTrue(text, text.contains("CHERRY"))
            assertTrue(text, text.contains("123"))
            assertTrue(text, text.contains("中文"))
            assertEquals("", ocr.read(2) {})
        }
    }
}

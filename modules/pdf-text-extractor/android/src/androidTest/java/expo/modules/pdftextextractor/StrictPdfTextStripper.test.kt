package expo.modules.pdftextextractor

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.PDResources
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.graphics.form.PDFormXObject
import java.io.File
import java.io.IOException
import org.junit.After
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StrictPdfTextStripperTest {
    private val context
        get() = InstrumentationRegistry.getInstrumentation().targetContext
    private lateinit var pdf: File

    @Before
    fun createPdfWithCompressedForm() {
        PDFBoxResourceLoader.init(context)
        pdf = File.createTempFile("pdf_form_budget_", ".pdf", context.cacheDir)
        PDDocument().use { document ->
            val page = PDPage()
            document.addPage(page)
            val form = PDFormXObject(document).apply {
                resources = PDResources().apply {
                    put(COSName.getPDFName("F1"), PDType1Font.HELVETICA)
                }
                setBBox(PDRectangle.LETTER)
            }
            form.cosObject.createOutputStream(COSName.FLATE_DECODE).use { output ->
                // A valid, highly compressed comment exhausts the scaled-down scratch budget
                // during decoding, before the form's text reaches the stripper.
                output.write("% padding\n".repeat(32 * 1024).toByteArray(Charsets.US_ASCII))
                output.write("BT /F1 12 Tf 20 20 Td (Body) Tj ET\n".toByteArray(Charsets.US_ASCII))
            }
            PDPageContentStream(document, page).use { content ->
                content.beginText()
                content.setFont(PDType1Font.HELVETICA, 12f)
                content.newLineAtOffset(20f, 40f)
                content.showText("Header")
                content.endText()
                content.drawForm(form)
            }
            document.save(pdf)
        }
        assertTrue("The source itself must fit the smaller budget", pdf.length() < 128 * 1024)
    }

    @After
    fun deletePdf() {
        if (::pdf.isInitialized) pdf.delete()
    }

    @Test
    fun readsBothPageAndFormTextWithinBudget() {
        openPdf(1024 * 1024L).use { document ->
            val text = StrictPdfTextStripper().getText(document)
            assertTrue(text.contains("Header"))
            assertTrue(text.contains("Body"))
        }
    }

    @Test
    fun rejectsPartialTextWhenFormExceedsScratchBudget() {
        openPdf(128 * 1024L).use { document ->
            // The default PDFTextStripper swallows this Do failure and returns only Header.
            val error = assertThrows(IOException::class.java) {
                StrictPdfTextStripper().getText(document)
            }
            assertTrue(
                error.message.orEmpty().contains("Maximum allowed scratch file memory exceeded")
            )
        }
    }

    private fun openPdf(maxStorageBytes: Long): PDDocument = PDDocument.load(
        pdf,
        MemoryUsageSetting.setupMixed(16 * 1024L, maxStorageBytes).setTempDir(context.cacheDir)
    )
}

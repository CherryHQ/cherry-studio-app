package expo.modules.pdftextextractor

import com.tom_roush.pdfbox.contentstream.operator.Operator
import com.tom_roush.pdfbox.cos.COSBase
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import java.io.Writer

internal const val MAX_PDF_TEXT_CHARACTERS = 1_000_000
internal data class PdfPageText(val text: String = "", val hasImages: Boolean = false)
internal data class PdfNativeTextPages(val pages: List<PdfPageText>, val truncated: Boolean)

/** PDFBox invokes endPage while making one traversal; getText per page rescans the page tree. */
internal fun readPdfTextPages(
    document: PDDocument, maxPages: Int, checkCancelled: () -> Unit
): PdfNativeTextPages {
    val pages = MutableList(maxPages) { PdfPageText() }
    val writer = object : Writer() {
        val page = StringBuilder()
        var remaining = MAX_PDF_TEXT_CHARACTERS
        var truncated = false
        override fun write(buffer: CharArray, offset: Int, length: Int) {
            val count = minOf(length, remaining)
            page.append(buffer, offset, count)
            remaining -= count
            if (count < length) truncated = true
        }
        override fun flush() {}
        override fun close() {}
    }
    val stripper = object : StrictPdfTextStripper() {
        var hasImages = false
        override fun processPage(page: PDPage) {
            checkCancelled()
            super.processPage(page)
        }
        override fun startPage(page: PDPage) {
            hasImages = false
            super.startPage(page)
        }
        override fun processOperator(operator: Operator, operands: MutableList<COSBase>) {
            if (operator.name == "BI" || (operator.name == "Do" &&
                (operands.firstOrNull() as? COSName)?.let { resources.getXObject(it) } is PDImageXObject)) {
                hasImages = true
            }
            // The normal stream engine descends into Form XObjects, including their images.
            super.processOperator(operator, operands)
        }
        override fun endPage(page: PDPage) {
            if (writer.page.lastOrNull()?.isHighSurrogate() == true) {
                writer.page.setLength(writer.page.length - 1)
            }
            pages[currentPageNo - 1] = PdfPageText(writer.page.toString().trim(), hasImages)
            writer.page.setLength(0)
            super.endPage(page)
        }
    }
    stripper.startPage = 1
    stripper.endPage = maxPages
    stripper.writeText(document, writer)
    checkCancelled()
    return PdfNativeTextPages(pages, writer.truncated)
}

/**
 * A page whose native layer holds at most a page number, header or caption. Scanned bodies keep
 * such text beside their image; a text page with a logo or figure has far more.
 */
internal fun isSparsePdfText(text: String): Boolean {
    var count = 0
    for (char in text) {
        if (char.isLetterOrDigit() && ++count >= 200) return false
    }
    return true
}

/** OCR owns visual reading order; keep native lines it missed without repeating matching text. */
internal fun mergePdfPageText(nativeText: String, recognized: String): String {
    if (!hasUsablePdfText(nativeText)) return recognized
    if (!hasUsablePdfText(recognized)) return nativeText
    fun normalized(text: String) = text.filter { it.isLetterOrDigit() }.lowercase()
    val recognizedKey = normalized(recognized)
    val missing = nativeText.lineSequence().filter { line ->
        val key = normalized(line)
        key.isNotEmpty() && !recognizedKey.contains(key)
    }.toList()
    return (listOf(recognized) + missing).joinToString("\n")
}

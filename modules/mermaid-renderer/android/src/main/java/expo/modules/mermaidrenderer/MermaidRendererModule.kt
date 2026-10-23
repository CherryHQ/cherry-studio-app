package expo.modules.mermaidrenderer

import android.graphics.Paint
import android.graphics.Typeface
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class MermaidRendererModule : Module() {
    private val renderingDispatcher = Dispatchers.Default.limitedParallelism(1)

    override fun definition() = ModuleDefinition {
        Name("MermaidRenderer")
        AsyncFunction("render") Coroutine { source: String, palette: Map<String, String> ->
            withContext(renderingDispatcher) {
                DiagramRenderer("sans-serif").render(source, palette, AndroidTextMeasurer())?.let {
                    mapOf(
                        "svg" to it.svg, "width" to it.width, "height" to it.height,
                        "accessibilityLabel" to it.accessibilityLabel,
                    )
                }
            }
        }
    }
}

private class AndroidTextMeasurer : DiagramTextMeasurer {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    override fun measure(text: String, fontSize: Double, fontWeight: Int, italic: Boolean): MeasuredText {
        val style = (if (fontWeight >= 600) Typeface.BOLD else Typeface.NORMAL) or
            (if (italic) Typeface.ITALIC else Typeface.NORMAL)
        paint.typeface = Typeface.create("sans-serif", style)
        paint.textSize = fontSize.toFloat()
        val metrics = paint.fontMetrics
        return MeasuredText(
            paint.measureText(text).toDouble(),
            maxOf((metrics.descent - metrics.ascent).toDouble(), fontSize * 1.2),
        )
    }
}

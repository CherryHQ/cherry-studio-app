package expo.modules.mermaidrenderer

import build.raft.mermaid.core.MermaidDiagramType
import build.raft.mermaid.core.MermaidDiagram
import build.raft.mermaid.core.FlowchartDiagram
import build.raft.mermaid.core.SequenceDiagram
import build.raft.mermaid.core.ClassDiagram
import build.raft.mermaid.core.StateDiagram
import build.raft.mermaid.core.MindmapDiagram
import build.raft.mermaid.core.PieDiagram
import build.raft.mermaid.core.MermaidParseResult
import build.raft.mermaid.core.MermaidParser
import build.raft.mermaid.layout.DiagramPalette
import build.raft.mermaid.layout.DrawCommand
import build.raft.mermaid.layout.DrawEllipse
import build.raft.mermaid.layout.DrawLine
import build.raft.mermaid.layout.DrawPath
import build.raft.mermaid.layout.DrawPolygon
import build.raft.mermaid.layout.DrawPolyline
import build.raft.mermaid.layout.DrawRect
import build.raft.mermaid.layout.DrawText
import build.raft.mermaid.layout.LayoutConfig
import build.raft.mermaid.layout.SceneColor
import build.raft.mermaid.layout.SceneSize
import build.raft.mermaid.layout.TextMeasurer
import build.raft.mermaid.layout.simple.SimpleMermaidLayout
import build.raft.mermaid.layout.simple.layout
import build.raft.mermaid.render.svg.SvgRenderer

/** Only these bridge types are exported to Swift; upstream models stay internal. */
interface DiagramTextMeasurer {
    fun measure(text: String, fontSize: Double, fontWeight: Int, italic: Boolean): MeasuredText
}

class MeasuredText(val width: Double, val height: Double)

class RenderedDiagram(
    val svg: String,
    val width: Double,
    val height: Double,
    val accessibilityLabel: String,
)

/** Presentation-only adapter shared by the Android module and the iOS framework. */
class DiagramRenderer(private val fontFamily: String) {
    fun render(
        source: String,
        palette: Map<String, String>,
        textMeasurer: DiagramTextMeasurer,
    ): RenderedDiagram? {
        // Bound work before invoking the parser/layout engine. Oversized diagrams keep their source.
        if (source.length > 32_768 || source.count { it == '\n' } > 256) return null

        return try {
            val type = MermaidParser.detectType(source)
            if (type !in SUPPORTED_TYPES) return null
            val parsed = MermaidParser.parse(source) as? MermaidParseResult.Success ?: return null
            if (!withinLayoutBudget(parsed.diagram)) return null
            val measurer = TextMeasurer { text, style ->
                val size = textMeasurer.measure(text, style.fontSize, style.fontWeight, style.italic)
                SceneSize(size.width, size.height)
            }
            val scene = SimpleMermaidLayout.layout(parsed, measurer, LayoutConfig())
            if (!scene.width.isFinite() || !scene.height.isFinite() ||
                scene.width !in 1.0..16_384.0 || scene.height !in 1.0..16_384.0 ||
                scene.commands.size > 5_000
            ) return null

            val themed = scene.copy(
                commands = scene.commands.map { themeCommand(it, palette) },
                // React Native supplies the accessible image label; SVG DOM ID references do not.
                accessibilityTitle = null,
                accessibilityDescription = null,
                // This component presents diagrams; navigation remains with its caller.
                links = emptyList(),
            )
            val svg = SvgRenderer.render(themed, baseId = "cherry-diagram")
            if (svg.length > 524_288) return null
            RenderedDiagram(
                svg, scene.width, scene.height,
                listOfNotNull(scene.accessibilityTitle, scene.accessibilityDescription)
                    .filter { it.isNotBlank() }.joinToString(". ").ifBlank { source },
            )
        } catch (_: Exception) {
            // Unsupported syntax and layout failures are represented by the original code block.
            null
        }
    }

    private fun themeCommand(command: DrawCommand, palette: Map<String, String>): DrawCommand {
        fun color(value: SceneColor): SceneColor {
            val role = when (value.value.lowercase()) {
                DiagramPalette.INK -> "foreground"
                DiagramPalette.MUTED, DiagramPalette.FAINT -> "mutedForeground"
                DiagramPalette.CANVAS -> "background"
                DiagramPalette.SURFACE, DiagramPalette.SURFACE_STRONG,
                DiagramPalette.BLUE_SURFACE, DiagramPalette.GREEN_SURFACE,
                DiagramPalette.RED_SURFACE, DiagramPalette.AMBER_SURFACE,
                DiagramPalette.PURPLE_SURFACE, DiagramPalette.CYAN_SURFACE,
                DiagramPalette.ROSE_SURFACE, DiagramPalette.RED_SOFT,
                DiagramPalette.PEACH_SURFACE, DiagramPalette.GREEN_STRONG,
                DiagramPalette.NEUTRAL_SURFACE -> "surface"
                DiagramPalette.BORDER, DiagramPalette.GRID, DiagramPalette.GRID_FAINT -> "border"
                DiagramPalette.OUTLINE -> "outline"
                DiagramPalette.BLUE, DiagramPalette.BLUE_TINT -> "chart1"
                DiagramPalette.GREEN, DiagramPalette.GREEN_TINT -> "chart2"
                DiagramPalette.RED, DiagramPalette.RED_TINT, DiagramPalette.ROSE -> "chart3"
                DiagramPalette.AMBER, DiagramPalette.AMBER_TINT -> "chart4"
                DiagramPalette.PURPLE, DiagramPalette.PURPLE_TINT,
                DiagramPalette.CYAN, DiagramPalette.CYAN_TINT -> "chart5"
                else -> return value // Explicit source colors remain diagram content.
            }
            return palette[role]?.let(::SceneColor) ?: value
        }

        return when (command) {
            is DrawRect -> command.copy(fill = color(command.fill), stroke = color(command.stroke))
            is DrawEllipse -> command.copy(fill = color(command.fill), stroke = color(command.stroke))
            is DrawLine -> command.copy(stroke = color(command.stroke))
            is DrawPolyline -> command.copy(stroke = color(command.stroke))
            is DrawPath -> command.copy(stroke = color(command.stroke))
            is DrawPolygon -> command.copy(
                fill = color(command.fill),
                gradient = command.gradient?.let {
                    it.copy(startColor = color(it.startColor), endColor = color(it.endColor))
                },
            )
            is DrawText -> command.copy(style = command.style.copy(
                color = color(command.style.color), fontFamily = fontFamily,
            ))
        }
    }
}

private fun withinLayoutBudget(diagram: MermaidDiagram): Boolean = when (diagram) {
    is FlowchartDiagram -> diagram.nodes.size <= 128 && diagram.edges.size <= 256 && diagram.subgraphs.size <= 32
    is SequenceDiagram -> diagram.actors.size <= 32 && diagram.events.size <= 256
    is ClassDiagram -> diagram.classes.size <= 128 && diagram.relationships.size <= 256 &&
        diagram.classes.sumOf { it.members.size } <= 512
    is StateDiagram -> diagram.states.size <= 128 && diagram.transitions.size <= 256
    is MindmapDiagram -> diagram.nodes.size <= 128 && diagram.nodes.all { it.depth <= 16 }
    is PieDiagram -> diagram.sections.size <= 64
    else -> false
}

private val SUPPORTED_TYPES = setOf(
    MermaidDiagramType.FLOWCHART,
    MermaidDiagramType.SEQUENCE,
    MermaidDiagramType.CLASS,
    MermaidDiagramType.STATE,
    MermaidDiagramType.MINDMAP,
    MermaidDiagramType.PIE,
)

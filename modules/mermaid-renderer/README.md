# Mermaid Renderer

Private native adapter for CherryUI's `MermaidDiagram` display component. It accepts existing
Mermaid source, lays out a diagram off the UI thread, and returns SVG, dimensions, and an
accessibility label. It owns no messages, persistence, network service, Agent behavior, or editor.

## Integration

- Android: Expo autolinking registers `MermaidRendererModule`. Gradle compiles the shared adapter
  source with the published Android engine libraries.
- iOS: Expo autolinking registers the Swift module. Its CocoaPods build phase runs the Kotlin
  CocoaPods `syncFramework` task **during the native Xcode build**, then stages the static
  `CherryMermaid.framework` in `PODS_CONFIGURATION_BUILD_DIR`. Both the module and final app link
  that framework. Pod installation and JavaScript installation do not compile Kotlin.
- The React Native component uses the existing `react-native-svg` renderer. Neither Compose,
  Kuikly, WebView, nor the JavaScript Mermaid engine is added.
- Existing development clients without the module show the source fallback until rebuilt.

`gradle.properties` pins both platforms to `mermaid-native` **0.1.14**. Engine artifacts are
downloaded from the upstream public Maven repository. The iOS build needs JDK 17 or newer in
addition to Xcode; the checked-in Gradle 8.13 wrapper downloads its pinned distribution as needed.
The dependency build follows Xcode's Debug/Release configuration and device/simulator architectures.
Use the repository's normal development build workflow; no separate manual framework build or
generated native project edits are needed.

The Gradle wrapper scripts/JAR are from Gradle `v8.13.0` (Apache-2.0). Its JAR SHA-256 is
`81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f`; distribution integrity is pinned
in `shared/gradle/wrapper/gradle-wrapper.properties`.

## Display contract

The initial supported families are flowchart, sequence, class, state, mind map, and pie, within
[upstream's bounded syntax](https://github.com/botiverse/mermaid-native/blob/v0.1.14/compatibility/diagram-families.csv).
Other families and invalid input return a source fallback. Layout is not pixel-identical to
desktop Mermaid. Source-defined interactions do not trigger navigation or callbacks.

Android Paint and iOS font metrics measure the fonts emitted into the SVG. Default diagram colors
map to CherryUI theme tokens; explicit source colors are retained except when equal to an upstream
default palette color. Font preferences and system text scaling scale the complete diagram without
changing label-to-node geometry. Wide diagrams scroll horizontally instead of shrinking text.

Inputs are bounded to 32,768 UTF-16 units and 256 newline characters. Additional per-family limits
bound layout work (128 graph nodes, 256 graph edges/events, 32 sequence participants, 64 pie
sections, and 16 mind-map levels). Oversized layouts and SVG output return a fallback. These bounds
are presentation limits, not a claim of complete isolation from every upstream parser defect.

## Validation status

Implementation is tracked by [#1417](https://github.com/CherryHQ/cherry-studio-app/issues/1417).
Native builds, automated tests, and device acceptance have **not been run** for this change.
The upstream Maven metadata lists Android and iOS device/simulator variants; that is dependency
availability evidence, not Cherry runtime acceptance.

After the user authorizes verification, use the repository's development build and device workflow.
The `Components/Mermaid Diagram` stories cover the six families, Chinese/English labels,
light/dark themes, large text, Markdown integration, and source fallback. Check horizontal diagram
scrolling inside the vertical transcript, source replacement, theme switching, and streaming fence
completion on both Android and iOS. Screen readers receive the declared diagram title/description,
or the source when no accessible metadata is supplied.

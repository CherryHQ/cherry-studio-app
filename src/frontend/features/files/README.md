# File Viewer

`/files/[fileEntryId]` is the shared page for managed images, SVG, Markdown, text, HTML, PDF, and modern Office files.
The route carries identity only. `FileEntryPreview` owns classification and the choice between
this page and system opening, and shares file export actions with the painting viewer.
This page owns reading, rendering, and copying.

- `FileImageViewer` reuses `ArtifactImageViewer`, including zoom and preview failure recovery. The header offers
  sharing, saving to Photos, and system opening.
- `FileTextViewer` reads at most 1 MiB plus one truncation-detection byte. Truncated HTML stays
  in source view. Copy uses the displayed source text and explicitly says when it is partial;
  sharing always exports the complete original file.
- `FileHtmlBody` loads strings through `react-native-webview`, with local file access and cookie
  sharing disabled, and no app message bridge. Web links leave through `openExternalUrl`; other
  navigations are blocked. Load/process failures show the source, and the user can switch manually.
- `FileSvgViewer` owns local SVG reads, loading, and retry.
  SVG uses an image inside a WebView so vector content scales without executing document scripts.
- `FileSvgBody` places the base64 image in an app-authored HTML shell. Its content policy
  denies network, frames, forms, and authored scripts; image data is allowed. Native file
  access and cookies are disabled. Its only bridge messages report image readiness or failure.
  Pinch and scrolling stay inside the native WebView.
- `FilePdfViewer` embeds `react-native-pdf-renderer` for local PDF scrolling and zoom on both
  platforms. It uses the new-architecture component availability API, reports load errors and
  timeouts inline, and keeps the existing export menu. Android renders pages as images, without
  text selection or PDF-link interaction. Native back and system-edge gestures retain ownership.
- SVG reads are capped at 4 MiB. Original exports remain complete.
  SVG query results are discarded as soon as the viewer has no observer.
- The shared `FileEntryPreview` sharing helpers copy into an OS-managed cache directory using the
  display filename. The copy survives closing the share sheet because Android recipients may read
  it later.

Whole-text copying is explicit. Native partial selection is disabled on this scroll surface until
its cancellation behavior is accepted on both platforms. The image viewer uses the existing
pinch/pan/double-tap interaction; native navigation owns back, and image zoom disables the iOS pop
gesture as in the painting viewer. The new page uses ordinary stack transitions.

The PDF renderer is a new native dependency and requires a development-client rebuild before device acceptance.
Office uses the same [desktop-derived Office renderer](office/README.md) on iPhone, iPad and Android
for DOCX, XLSX and PPTX. Quick Look supplies iOS outer thumbnails. The per-format Expo DOM bundles use the existing WebView native
module; all document bytes stay local. Native controls adapt to phones and wider/split windows.
Legacy formats retain platform opening. AnyDoc remains the attachment content parser.
No device acceptance or automated tests were run as part of implementation. See the
[file preview reference](../../../../docs/references/file-preview-and-viewer.md) for scope and the
remaining acceptance matrix.

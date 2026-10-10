# File Viewer

`/files/[fileEntryId]` is the shared page for managed images, Markdown, text, HTML, PDF, and Office
Open XML documents.
The route carries identity only. `FileEntryPreview` owns classification and the choice between
this page and system opening, and shares file export actions with the painting viewer.
This page owns reading, rendering, and copying.

Complete HTML also offers Share as image and Share as PPT actions. `useHtmlConversion` owns progress,
cancellation and opening the system share sheet as soon as conversion finishes, using the shared
file export helper without an intermediate result panel. A compact spinner, progress label and cancel
action sit above the visible HTML content. The shared
[`HtmlCapture`](../../components/HtmlCapture/README.md) surface stays laid out beneath the opaque
viewer and supplies sequential native captures to `Backend.documentExport.convertHtml`.
This page supplies the HTML measurement/page scripts and applies the selected watermark before
delivering each captured page; the shared executor owns capture, cancellation and temporary PNG release.
See [HTML Conversion](../../../../docs/references/html-conversion.md)
for format behavior, limits, selection evidence and pending acceptance.

- `FileImageViewer` reuses `ArtifactImageViewer`, including zoom and preview failure recovery. Its
  bottom toolbar offers sharing and saving to Photos; the header retains system opening. A
  caller-owned image editing request also supplies Edit. Crop/rotate happens before sending and
  creates a new managed image through `Backend.file.editImage`. Only an accepted source-matching
  callback replaces the caller's attachment. The source file and existing messages retain their
  original bytes. Cancellation and failed saves retain the current draft image.
- `FileTextViewer` reads at most 1 MiB plus one truncation-detection byte. Truncated HTML stays
  in source view. `FileTextBody` renders plain text and source as a virtualized list of bounded
  blocks from `splitTextBlocks`. Copy uses the displayed source text and explicitly says when it is partial;
  sharing always exports the complete original file.
- `FileHtmlBody` loads strings through `react-native-webview`, with local file access and cookie
  sharing disabled, and no app message bridge. Web links leave through `openExternalUrl`; other
  navigations are blocked. Load/process failures show the source, and the user can switch manually.
- `FileDocumentViewer` renders PDF, DOCX, PPTX and XLSX through `FileDocumentPreview`, the trusted
  WebView page from [`@cherrystudio/file-preview-webview`](../../../../packages/file-preview-webview/README.md).
  `useDocumentPreviewPage` loads the bundled page; `FilePreviewBridge` serves exact byte ranges and
  bundled PDF resources over the page's message bridge. Other document types keep the system-open
  state. The package owns everything inside the document; this page owns file access, the container,
  theme, locale, logging and the system-open fallback.
- The shared `FileEntryPreview` sharing helpers copy into an OS-managed cache directory using the
  display filename. The copy survives closing the share sheet because Android recipients may read
  it later.

Whole-text copying is explicit. Native partial selection is disabled on this scroll surface until
its cancellation behavior is accepted on both platforms. The image viewer uses the existing
pinch/pan/double-tap interaction; native navigation owns back, and image zoom disables the iOS pop
gesture as in the painting viewer. The new page uses ordinary stack transitions.

An editable preview adds `imageEditRequestId` to its route identity. This opaque in-memory request
is owned by `appShell/imagePreview`; callbacks never enter URLs, persisted drafts or file rows.
Back first cancels an active edit. Leaving the preview or disposing its source releases the request;
late results cannot restore a removed attachment. Repeated edits stay in the same preview and use
the last accepted image. The crop/rotate change adds no native dependency. Its gesture, orientation,
save/cancel and light/dark acceptance remain pending authorized device verification.

The new native dependencies require a development-client rebuild before device acceptance.
No device acceptance or automated tests were run as part of implementation. See the
[file preview reference](../../../../docs/references/file-preview-and-viewer.md) for scope and the
remaining acceptance matrix.

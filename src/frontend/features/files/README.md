# File Viewer

`/files/[fileEntryId]` is the shared page for managed images, Markdown, text, and HTML.
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
- `shareFile` copies into an OS-managed cache directory using the display filename. The copy
  survives closing the share sheet because Android recipients may read it later.

Whole-text copying is explicit. Native partial selection is disabled on this scroll surface until
its cancellation behavior is accepted on both platforms. The image viewer uses the existing
pinch/pan/double-tap interaction; native navigation owns back, and image zoom disables the iOS pop
gesture as in the painting viewer. The new page uses ordinary stack transitions.

The new native dependencies require a development-client rebuild before device acceptance.
No device acceptance or automated tests were run as part of implementation. See the
[file preview reference](../../../../docs/references/file-preview-and-viewer.md) for scope and the
remaining acceptance matrix.

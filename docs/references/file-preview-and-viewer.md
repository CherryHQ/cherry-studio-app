# File Preview And Viewer

> Status: implemented in source; native acceptance pending. Builds, automated tests, and device
> acceptance were not run for this change. Text excerpts remain a follow-up.

This reference owns how managed files appear, where a tap goes, and how their contents leave the
app. [File Model](./data/file-model.md) owns bytes, identity, immutability, and deletion.

## Product Scope

The viewer supports generated images, SVG, readable Markdown and text, HTML pages produced by
`write_file`, PDF, and modern Office documents. Code and data files can also be read as plain text
and shared. Files are previewed from local bytes without an online document-viewing service.

The model continues to decide when to call `write_file`; no new usage constraint is imposed.
Creating an HTML page and explicitly saving a requested document both require writing a file.

Android previously handed every file to an external chooser, leaving generated text dependent on
installed apps. iOS already had Quick Look for platform-supported formats. Supported kinds now
open inside the app using the same route and rendering engines on iPhone, iPad and Android.
Quick Look remains the iOS thumbnail provider and an explicit system-opening option.

## Classification And Opening

`fileEntryPreviewKind` in `FileEntryPreview` owns one closed product vocabulary. It uses normalized
`mediaType`, including removal of MIME parameters, and does not infer kinds from extensions.
CherryUI's renderer vocabulary remains an open string so plugin registration remains possible.

| Kind | Media types | Open on iOS and Android |
| --- | --- | --- |
| `image` | `image/*` | In-app image viewer; SVG uses a local WebView image |
| `markdown` | `text/markdown` | In-app Markdown reader |
| `html` | `text/html` | In-app rendered HTML page |
| `text` | Remaining `text/*`, JSON, XML, YAML | In-app text reader |
| `pdf` | `application/pdf` | In-app native PDF viewer |
| `office` | DOCX, XLSX, PPTX | Same local Office WebView on iPhone, iPad and Android |
| `document` | Legacy Office, OpenDocument, and remaining types | Platform viewer: in-app Quick Look on iOS, external chooser on Android |

`useOpenFileEntry` owns the decision. The composer, user-message attachments, assistant outputs,
and library tiles all enter through `FileEntryPreview`. The library's existing Images/Documents
filter groups the classifier's results; it does not introduce one filter tab per viewer kind.

CherryUI `FilePreview` and `FileAttachmentPreview` require `onPress`. They retain their press
and accessibility contracts, while the caller owns navigation and opening errors. CherryUI's
exported `openFilePreview` remains the platform primitive: Quick Look on iOS, app chooser on Android.

## File Surfaces

| Surface | Images | Other files |
| --- | --- | --- |
| Composer | Square thumbnail with removal control | Compact file-type icon above a multiline title |
| Chat file picker | Square thumbnail | iOS Quick Look thumbnail / Android type artwork beside filename metadata |
| User-message strips | Square thumbnail | Compact file-type icon above a multiline title |
| Assistant deliverables | Image itself at message width | Full-width filename/type row |
| File library | Bounded WebP thumbnail | Title-first card with file-type icon at the bottom |

Assistant images use the existing backend thumbnail query. Until dimensions load, the image
reserves a square. The rendered aspect ratio matches the asset, with a height cap of 1.25 times
its width and contain fitting for taller images. A thumbnail failure leaves the filename and an
accessible open action. Opening always resolves the original file.

Raster derivatives stay in the backend file-preview pipeline. The composer and library share
CherryUI's extension-to-icon presets and theme colors; icon routing never controls opening.
Generated-file badges fit inside library cards. On iOS, compact attachments, library cards and
assistant file rows use Quick Look thumbnails in their artwork slots, retaining filenames and
fallback artwork while thumbnails load or fail. Android keeps type icons. Library list and file-picker rows request `thumbnail` explicitly. The generic `icon` variant remains
icon-only; `thumbnail` uses Quick Look on iOS and extension cards on
Android. Text excerpt cards are deferred.

## Viewer

The route is `/files/[fileEntryId]`, implemented by `src/frontend/features/files`. Its identity is
only the file entry id. File resolution uses the same query as the cards. Invalid or unavailable
entries show an inline unavailable state; reads and image loads have explicit retry states.

The native stack owns entry, exit, and back. The header is opaque so content does not disappear
under system bars. Images use constant black/white chrome; text uses theme surfaces. iOS's pop
gesture is disabled while an image is zoomed, matching the existing painting viewer. Android
system back remains native navigation.

Every resolved file has Share and Open with actions in the overflow menu.
Images also have Save to Photos, using the add-only permission flow shared with the painting viewer.
SVG uses themed document chrome and sharing instead of Save to Photos, since Photos is a raster
export destination. SVG remains under Images in the library and keeps image attachment cards.

### Image

`ArtifactImageViewer` provides pinch, pan, and double-tap zoom. Its optional error callback lets the
page render a retry state without losing sharing or system opening. The painting viewer retains
its own route and painting-specific actions.

### SVG And PDF

SVG loads as a base64 image in `FileSvgBody`, retaining vector rendering and browser zoom.
Image context disables document scripts, links, and external references. `write_file` records
new `.svg` outputs as `image/svg+xml`; import infers image types only when no specific type exists.
SVG attachments remain readable as bounded XML source; preview classification does not turn them
into model image inputs.

The controlled SVG WebView denies network, local-file access, document navigation, forms,
and authored scripts. Its app-generated readiness bridge accepts only `ready` / `error` strings.
Each load has a deadline and failure/retry state. It shares no cookies or application credentials.
SVG has a 4 MiB input budget, and its query result is discarded when the viewer closes.

PDF uses [react-native-pdf-renderer](https://github.com/douglasjunior/react-native-pdf-renderer),
which embeds PDFKit on iOS and PdfRenderer on Android. It opens the managed local URI, supports
scrolling and pinch zoom, and reports the current page. Android page images are capped at 2,048 px
per side; text selection, accessibility of page text, and link handling are not available there.
The header retains Share and Open with. A missing native component, load error, or initial-load
timeout shows an inline retry state instead of automatically leaving the app.

Preview loading belongs to this page's presentation path. It does not invoke the attachment parser
preference, create derived file entries, or change the bytes sent to models.

### Office

iPhone, iPad and Android preview DOCX, XLSX and PPTX using the same engines and spreadsheet algorithms as Cherry
Desktop commit `e131f495a9af593ec873bea34b935e97d644f586`. Quick Look supplies the iOS outer
thumbnail; tapping a supported file enters the unified page. Legacy DOC/XLS/PPT and OpenDocument files keep
platform opening; this port does not claim that desktop's three modern-format viewers cover them.

- DOCX uses `docx-preview@0.3.7`, including page breaks, headers, footers, notes, tables and images.
  Pages fit the available width initially; zoom preserves their original layout and permits panning.
- PPTX uses `@aiden0z/pptx-renderer@1.2.2` with lazy slides/media and a windowed slide list. Mobile
  starts with two slides and one viewport of overscan. External media relationships are removed.
- XLSX reuses Desktop's ExcelJS parser, styles/theme/number formatting, cached or evaluated formulas,
  merge geometry, two-axis virtual grid, images and ECharts integration. Unsupported charts and
  parse warnings are visible. The selected-cell overlay reveals clipped content without reflowing
  rows. Sheet tabs scroll horizontally; a physical keyboard can navigate cells. The native formula
  row opens a scrollable detail sheet with the original formula, displayed value, calculation source,
  and explicit copy actions. Selection clears on sheet changes. BMP/WebP images remain visible;
  browser image decode failures show a placeholder and the partial-content notice.

The `office/DocxPreviewDom.tsx`, `PptxPreviewDom.tsx` and `XlsxPreviewDom.tsx` Expo DOM boundaries
place each format's browser dependencies in its own single static bundle. Expo serves it through
Metro during development and embeds it for installed offline use; the viewer relies only on that
documented export, not on Web Workers, dynamic chunks or Metro runtime internals. It explicitly
selects the existing `react-native-webview`, because the default Expo DOM WebView lacks the
navigation and failure controls needed here. No separate web build script, hosted viewer, document
service, upload, or licensed SDK is introduced.

Selected document bytes cross one bounded read callback. The native reader sends at most
192 KiB per chunk, rejects nonsequential/out-of-range reads and changed files, and closes every
read-only handle. DOCX/PPTX are limited to 25 MiB, XLSX to 20 MiB. The desktop ZIP preflight and
parser limits remain in place; declared ZIP sizes do not guarantee a hard decompression memory cap.
AnyDoc remains the attachment content parser and does not supply preview pages.

The trusted shell needs native file access to load its bundled application assets. On iOS this is
limited to the embedded `www.bundle` directory, including its scripts/styles. Adding an OTA update
provider would also require explicit admission of its DOM asset directory. Document bytes
are passed through the bounded bridge, never navigated to as a file URL. Cross-file and universal
file URL access are disabled. A content policy installed before parsing blocks network resources,
frames, forms and authored inline scripts; document images/fonts must be embedded. Cookies and
storage sharing are disabled and navigation stays on the initial shell. DOCX HTTP/HTTPS/mailto
links and PPTX external shape actions cross a bounded, native-validated open action; document
bookmarks scroll and focus locally. Other schemes remain disabled. Same-origin development requests
are allowed for Metro modules; installed content has no network access.
The Expo native-module bridge remains disabled. These controls are separate from the intentionally
interactive generated-HTML viewer above.

Loading, retry, export actions and toolbars are native. A 60-second loading/busy deadline and native
WebView failures discard the preview, keeping the original file available through the header.
React render/commit errors and uncaught browser exceptions also reach this retry surface, even after
ready; failure is terminal for that attempt. A retry creates a fresh reader, DOM tree and resource
scope. Chart setup failures and partial image URL creation release earlier allocations.
XLSX parses on the WebView's own thread: that process is already separate from the native UI, the
native loading overlay covers the document while parsing, and leaving or retrying unmounts the
WebView, which ends the parse. DOCX/PPTX rendering stays in the WebView runtime as well. Native logs
retain bounded failure causes and stages, including parser, renderer, link and deadline errors. Mobile responsiveness and
memory still require device acceptance. All-hidden workbooks show their first sheet with a notice.

Controls use 48-point icon targets. Narrow windows arrange page navigation and zoom in two rows;
wider windows combine them. This uses measured container width and font scale, including tablet
split windows. DOCX/PPTX regions expose filename labels and keyboard focus after page/zoom commands.
Web content observes viewport changes, and spreadsheet virtualization is remeasured
when zoom changes. Chrome follows the application theme while authored pages/cells retain their
own colors. Cell detail text is limited to 32,768 characters per field at the bridge; truncated
details disclose that copy includes only the displayed portion. Source tracking, mobile adaptations and compatibility limits are in
[the Office implementation README](../../src/frontend/features/files/office/README.md).

### Markdown And Text

The reader loads at most 1 MiB plus one byte to detect truncation, with a read-only file handle that
is closed on success and failure. It strips a UTF-8 BOM, replaces malformed encoding, and avoids
splitting a final character when truncating. NUL-bearing content is refused as binary.

Complete Markdown uses the existing app `MarkdownText`, including its link behavior, tables,
code blocks, math, and typography preference. Plain text wraps at the screen width using body
typography. Source and structured data use the code font and horizontal scrolling for long lines.
Truncated Markdown is shown as raw text, and truncated HTML is never executed.

The truncation notice explains that sharing or system opening provides the complete file.
Copy text copies the decoded source, including Markdown markup and HTML source, not the rendered
page. When truncated, the action explicitly reads Copy displayed text. Partial native selection
is disabled on this scroll surface pending platform gesture acceptance; copying does not require
long press. Text query entries are discarded one minute after their last observer leaves.

### HTML

The overflow menu also offers PNG and image-based PPTX conversion for complete HTML sources.
See [HTML Conversion](./html-conversion.md) for pagination, limits, implementation selection and
pending native acceptance.

HTML uses `react-native-webview` with `source.html`, without a file URI or an application origin.
Authored scripts and network resources may run so generated charts and interactive pages work.
The page owns its colors and styling; a mobile viewport is added after loading only when absent.
Its default canvas stays constant white for browser-default black text, even with dark app chrome.
This is uncontrolled document content, so app theme colors do not replace authored page colors.

The container contract is:

- Disable `allowFileAccess`, `allowFileAccessFromFileURLs`, and
  `allowUniversalAccessFromFileURLs`.
- Use incognito mode, disable cookie sharing, and expose no application message bridge.
- Keep the initial document and same-document anchors in the viewer. HTTP/HTTPS navigation leaves
  through `openExternalUrl`; arbitrary schemes and embedded-frame navigations are rejected by the
  navigation callback. The native origin whitelist passes requests into this callback instead of
  opening unmatched schemes itself.
- Handle ordinary load failures and native content-process termination by showing source.
  View source remains available manually, including for script failures that native loading
  callbacks cannot detect. View page allows an explicit retry.

This limits the page's access to the app; it does not hide the page's own contents from scripts
included in that page. No backend capabilities, managed-file paths, or credentials are injected.

The earlier `@expo/dom-webview` proposal is superseded. Its installed implementation lacks ordinary
load-error and navigation-policy callbacks, and its local file-access properties cannot be disabled.
The maintained WebView supplies these controls and direct string loading. The choice therefore
addresses concrete missing interfaces rather than depending on a large `data:` URL experiment.

## Export And Feedback

`expo-sharing` presents the system share sheet through `appShell/fileExport`. SVG and non-image files
retain their full original bytes; ordinary raster images use the selected watermark policy, while
completed document exports keep their finalized bytes. Sharing copies the prepared file to
`{cacheDirectory}/FileExports/{entryId}/{revision-or-export-id}/{filename}` so recipients see the
display name, not the managed blob's UUID. The exported copy never becomes file authority. It remains in the
OS-managed cache after the sheet closes because Android recipients may read it asynchronously.
Only sharing out is added; no incoming-share extension is enabled.

| Failure | Feedback |
| --- | --- |
| Missing entry or bytes | Inline unavailable state with retry |
| Unreadable or binary text | Inline read error; sharing and system opening remain available |
| Image decoding failure | Inline retry state |
| HTML load/process failure | Source plus a failure explanation |
| Share or system-open failure | One translated toast |
| Photo permission cannot be requested again | Existing settings guidance |

## Native Acceptance Still Required

The PDF extension adds `react-native-pdf-renderer` alongside the existing `expo-sharing`,
`react-native-webview` dependencies. A development-client rebuild is
required before PDF acceptance; a JavaScript reload alone cannot add the native module.

Acceptance should cover both light and dark themes, concentrating on Android's former gaps:

1. Generate an image in chat: see the image, open, zoom, save to Photos, and share it.
2. Open generated `.md`, `.txt`, `.yaml`, and `.json` from chat, composer, and library without an
   external app. Verify ordinary and large-font scrolling and explicit copying.
3. Open HTML with inline scripts and remote chart resources. Verify local anchors, external links,
   blocked non-web schemes, manual source switching, and native failure fallback.
4. Open empty, missing, binary-mislabeled, exactly 1 MiB, and larger files. Truncation must never
   silently change what Share exports.
5. Share a file with a Chinese display name and confirm the recipient can read its complete bytes.
6. Retain iOS Quick Look and Android chooser behavior for unsupported document types; verify
   permission denial, unavailable handlers, and native back from each viewer.
7. Open generated and imported SVG, including viewBox-only dimensions, malformed input, embedded
   scripts, and external references. Confirm scalable rendering, local-only resources, and retry.
8. Open multi-page and image-only PDF, zoom and scroll, leave and reopen, and exercise failure with
   missing bytes or an older development client. Verify page counts and system-edge back behavior.

9. Open DOCX with tables, embedded fonts, headers/footers and page breaks; PPTX with charts,
   pictures and many slides; XLSX with merges, formulas, drawings, charts and multiple sheets.
   Compare representative files against Desktop at the recorded commit. Exercise zoom, rotation,
   split windows, large fonts, sheet changes, malformed ZIPs and over-budget files.
10. On an installed development build, open Office files offline and confirm all DOM assets are
    embedded. Exercise remote relationship blocking, native process termination, and back during
    parsing. Check phone/tablet light/dark chrome and the unified iPhone/iPad viewer in full/split windows. Confirm Quick Look thumbnails remain visible
    on iOS before opening, failure falls back to artwork, formula copying preserves source and
    late image warnings do not reset sheet/zoom. Exercise render failures after ready and retry.

## Deferred

Text excerpt cards, unified legacy Office rendering, audio/video players, source-code highlighting, CSV table
rendering, and Markdown rendered/source switching are separate follow-ups. `write_file` policy is
unchanged. The first implementation delivers opening, reading, rendered HTML, and export.

A native reading view built on AnyDoc's document IR is a separate follow-up, not a replacement for
the fidelity viewers above. The IR is a flowing content model: runs, paragraphs, lists, tables,
images and typed chart data, with no page, slide or cell geometry. It would answer "what the file
says" for the legacy Office, OpenDocument, RTF and EPUB kinds that currently open externally, and
could render in React Native without a WebView. The Office viewer keeps answering "what the file
looks like".

Related: [UI Components](./ui-components.md), [Navigation And Insets](./navigation-and-insets.md),
[Design Spec](../../DESIGN.md), [Interaction And Gesture Arbitration](./interaction-and-gesture-arbitration.md).

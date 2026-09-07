# File Preview And Viewer

> Status: implemented in source; native acceptance pending. Builds, automated tests, and device
> acceptance were not run for this change. Text excerpts remain a follow-up.

This reference owns how managed files appear, where a tap goes, and how their contents leave the
app. [File Model](./data/file-model.md) owns bytes, identity, immutability, and deletion.

## Product Scope

The first delivery focuses on current outputs: generated images, readable Markdown and text, and
HTML pages produced by `write_file`. Code and data files can also be read as plain text and shared.
This prioritization does not claim that PDF, Office, or other formats have no mobile value.

The model continues to decide when to call `write_file`; no new usage constraint is imposed.
Creating an HTML page and explicitly saving a requested document both require writing a file.

Android previously handed every file to an external chooser, leaving generated text dependent on
installed apps. iOS already had Quick Look for platform-supported formats. Both platforms now use
the same application viewer for the supported kinds below, while retaining system opening.

## Classification And Opening

`fileEntryPreviewKind` in `FileEntryPreview` owns one closed product vocabulary. It uses normalized
`mediaType`, including removal of MIME parameters, and does not infer kinds from extensions.
CherryUI's renderer vocabulary remains an open string so plugin registration remains possible.

| Kind | Media types | Open on iOS and Android |
| --- | --- | --- |
| `image` | `image/*` | In-app image viewer |
| `markdown` | `text/markdown` | In-app Markdown reader |
| `html` | `text/html` | In-app rendered HTML page |
| `text` | Remaining `text/*`, JSON, XML, YAML | In-app text reader |
| `document` | Remaining types, including PDF and Office | Platform viewer |

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
| User-message strips | Existing square preview | Existing platform fallback |
| Assistant deliverables | Image itself at message width | Full-width filename/type row |
| File library | Bounded WebP thumbnail | Title-first card with file-type icon at the bottom |

Assistant images use the existing backend thumbnail query. Until dimensions load, the image
reserves a square. The rendered aspect ratio matches the asset, with a height cap of 1.25 times
its width and contain fitting for taller images. A thumbnail failure leaves the filename and an
accessible open action. Opening always resolves the original file.

Raster derivatives stay in the backend file-preview pipeline. The composer and library share
CherryUI's extension-to-icon presets and theme colors; icon routing never controls opening.
Generated-file badges fit inside library cards. Text excerpt cards are deferred; the default
`thumbnail` variant keeps iOS Quick Look thumbnails and Android extension cards.

## Viewer

The route is `/files/[fileEntryId]`, implemented by `src/frontend/features/files`. Its identity is
only the file entry id. File resolution uses the same query as the cards. Invalid or unavailable
entries show an inline unavailable state; reads and image loads have explicit retry states.

The native stack owns entry, exit, and back. The header is opaque so content does not disappear
under system bars. Images use constant black/white chrome; text uses theme surfaces. iOS's pop
gesture is disabled while an image is zoomed, matching the existing painting viewer. Android
system back remains native navigation.

Every resolved file has a primary Share action and an Open with action in the overflow menu.
Images also have Save to Photos, using the add-only permission flow shared with the painting viewer.

### Image

`ArtifactImageViewer` provides pinch, pan, and double-tap zoom. Its optional error callback lets the
page render a retry state without losing sharing or system opening. The painting viewer retains
its own route and painting-specific actions.

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

`expo-sharing` presents the system share sheet. Sharing copies the full original bytes to
`{cacheDirectory}/FileExports/{entryId}/{revision}/{filename}` so recipients see the display name,
not the managed blob's UUID. The exported copy never becomes file authority. It remains in the
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

The two new native dependencies are `expo-sharing` and `react-native-webview`. A development-client
rebuild is required before acceptance; a JavaScript reload alone cannot add these native modules.

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

## Deferred

Text excerpt cards, PDF/Office rendering, audio/video players, source-code highlighting, CSV table
rendering, and Markdown rendered/source switching are separate follow-ups. `write_file` policy is
unchanged. The first implementation delivers opening, reading, rendered HTML, and export.

Related: [UI Components](./ui-components.md), [Navigation And Insets](./navigation-and-insets.md),
[Design Spec](../../DESIGN.md), [Interaction And Gesture Arbitration](./interaction-and-gesture-arbitration.md).

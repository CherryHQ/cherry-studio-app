# Document Export

Document export is an application capability. Chat supplies final content; conversion has no
Agent, live transcript or navigation dependency. Source code and architectural changes do not
establish native fidelity or measured performance; acceptance remains user-owned.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `shared/contracts/documentExport.ts` | Documents, targets, artifacts, sessions and capture callbacks |
| `backend/services/documentExport` | Validation, resources, rendering, temporary files and explicit persistence |
| `DocumentExportRuntime` | Foreground admission and cleanup of sessions and HTML artifacts |
| `frontend/appShell/sharing` | Frozen requests, one `/share` panel, operation retention and disposal |
| `frontend/features/sharing` | BottomSheet, card previews, floating format tabs and capture strategy |
| `frontend/appShell/fileExport` | Watermarks, stable delivery copies, system sharing and Photos permissions |
| `frontend/features/chat/share` | Original-list selection, selected-ID reads and final-only projection |
| `frontend/features/library` | Single/batch entry points and explicitly saved export entries |

See [Code Organization](./code-organization.md), [Runtime Ownership](./runtime-ownership.md) and
[workflow contracts](../../src/shared/contracts/README.md). Export is not an Agent or MCP tool.

## Source and formats

A document contains ordered sections with optional author, model and bubble/message presentation,
text, Markdown, static pictures, attachment information and references. Generic document inputs
still support structured detail blocks. The chat adapter never produces thinking, process prose,
tool names, runtime statistics or diagnostic payloads. Matching expanded translations remain.

Inputs are copied and frozen. `session.document` and `session.markdown` require no files or resource
reads. Markdown image discovery uses parsed tokens, so code examples never download resources.
Managed and remote PNG/JPEG assets are cached by their real source identity; repeated aliases share
one read. Resource preparation uses two concurrent slots and preserves source order. Invalid images
remain retryable placeholders with explicit issues. Original source dimensions are still admitted;
this is not a guarantee that arbitrarily large source images fit every device's decoder.

All nonempty chat selections offer Image, HTML and Markdown. Original file groups offer only
applicable conversions; authored HTML conversion keeps its separate browser-capture strategy.
Closing a chooser does not claim delivery and leaves the panel open. Selection is changed by
starting again from the source, not through an adjustment action inside the panel.

## Preview and rendering

The panel first shows lightweight readable content, then prepares asset-bearing HTML. An image
preview does not require PNG generation. The foreground WebView keeps its identity across pages;
background card slots do not mount additional browsers. The same semantic page plan positions the
preview and capture slices.

Message image sharing produces one bounded card, 360 logical points wide. Its source-owned
header identifies the author and already-formatted date before the selected messages.
`imageFrame.layout: 'single'` selects its presentation and capture. After fonts and pictures settle,
the shared preview/capture script measures the actual whole image against a 3600-point ceiling,
including the author row, insets and optional footer. It clamps a boundary paragraph/list item by
lines, keeps complete code lines or table rows, and puts an ellipsis at the retained line/cell.
Indivisible headings, pictures and diagrams that cannot fit are dropped; orphan headings are
removed. There is no separate single-answer budget, overflow allowance or clipped-body fade.
Only the temporary image DOM is shortened; HTML/Markdown keep the frozen original snapshot.
The preview scrolls at readable card width. The panel shows HTML as a rendered webpage and
Markdown as raw text, each with a filename, message count and byte-size row.

Users choose watermark only in global settings. The sharing panel uses the resolved request style
and contains no watermark control.
When sharing watermark is enabled, the message-card footer follows the content surface and text
colors, with an inset separator, official theme-appropriate app icon, short scan copy and download
QR. Whitespace separates it from the body. Local saved output omits that watermark footer.

All message cards use fixed 3x density (1080px wide, at most 10800px tall). The capture owner keeps
native snapshots within the available viewport, then joins tiles into one PNG. A single tile retains
its PNG bytes directly, without another decode/encode pass. Generic document images retain full
pagination, with at most 480 content pixels plus 16 top spacing per page, 3x density and 64 pages.
Cuts avoid painted glyphs, images and the complete signature; indivisible objects fail explicitly.
Complete HTML keeps scrollable code, and Markdown retains authored fences and tables.

HTML uses a responsive column capped at 720 points. Export typography and watermark style are
frozen at opening; theme changes refresh previews until an active delivery holds its presentation. Generated
cards use the light card surface and dark background surface. The shared Cherry footer remains together at the end of the
document, not on every page. PNGs do not contain page-number footers.

Source-owned citations remain compact source counts and portable links. Ordinary attachments are
metadata rather than an implied attachment-file bundle. HTML keeps full code scrolling; Markdown
keeps full code/tables, embedded managed PNG/JPEG images and original remote links. External readers
may filter embedded data URLs. Image/formula issues remain visible; conversion failure never
silently changes the selected format.

## Temporary artifacts and saving

`session.render` returns complete temporary HTML, Markdown or ordered PNG descriptors. Native capture
awaits each page copy before releasing its pixels. Only complete artifacts enter the bounded cache;
failed output removes its partial directory. The session retains up to three artifact configurations
and two parsed HTML presentations; source assets remain shared until disposal. Retained owned
artifacts may be explicitly saved, and repeated saves reuse committed entries.

Share sends temporary descriptors directly through file export. It does not call `session.save`.
Image Save writes to Photos using stable OS-cache copies; document and PPT Save explicitly create
managed entries. All local Save actions render without watermark, independently of the sharing
setting or preview, before making those copies or entries.

`prepareSharedFile` makes a stable, filename-preserving delivery copy before an external reader
can outlive the source request. Finalized temporary outputs are not watermarked again. Original
non-image file sharing and original-image saving keep their bytes. Original bitmap sharing and
generated share formats follow the request's watermark setting without rewriting the global
preference.

The sharing request retains physical capture, copying and delivery promises, then runs registered
artifact cleanup and document disposal before releasing admission. The backend runtime cancels
active work in the background and disposes retained resources on shutdown. The capture executor
holds its physical lease until late native work finishes. OS-managed delivery copies can remain
for delayed receivers; no cancelled share creates a permanent file-library entry.

## Authored HTML

[HTML Conversion](./html-conversion.md) owns authored-page layout, PNG/PPTX limits and slide fitting.
`convertHtml` returns a temporary file, captured page previews and explicit `save`/`dispose` methods.
Preview and sharing do not persist it. The same ordered-file panel handles original HTML and its
converted results, including an all-HTML batch.

## Validation boundary

Regression tests cover final-only projection, source ordering, preview/capture separation, cache
reuse, cancellation, signature handling and resource lifetime. Changes to this capability need
user-authorized checks of real PNG pixels, both native gesture boundaries, Photos permission paths,
multi-file recipients, authored HTML/PPT fidelity and first-use versus cached latency. No current
build, test, type-check or device result is implied by these source descriptions.

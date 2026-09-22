# Document Export Page

Owns the fullscreen share layer, format/layout menus, preview and document capture strategy. The
app-shell handoff owns the selected source snapshots; this page never reads live chat state.
Closing retains the caller's selection. Dismissing the system share sheet returns to the optional
`returnTo` route, without claiming the recipient received the files.

Chat exports default to paged PNG images. Short content produces one image; longer content adds
pages without reducing resolution or omitting messages. The layout menu retains a single-long-image
option. HTML and Markdown remain available for every nonempty selection. Markdown prepares its
temporary file, including embedded local/generated pictures, before preview; Share delivers that same
artifact. An optional unchecked source toggle selects an alternate immutable document.

Images use a fixed 360-logical-pixel layout and 3x output density, independent of the device window.
Typography follows the frozen accessibility step; semantic colors follow the theme until delivery
starts. Chat images use right-aligned user bubbles, full-width answers and fixed-height code previews,
without document titles or message numbering. The Cherry signature and frozen timestamp remain.
HTML uses the same chat layout in a responsive column capped at 720 points, with full code content
scrolling inside 192-point panels. Images show the opening code viewport. Sources use a compact
count row with a single inline Globe icon and localized count; inline citations use gray superscripts.
Individual source cards are omitted from images and HTML.
Markdown preview renders the exact output text, including resource notes and signature, through
`session.previewMarkdown` and the same HTML typography/table styles. Local/generated PNG/JPEG images
are embedded as Base64 data URLs and displayed without captions. Remote image references remain
compact name/domain entries and retain their original URLs in the file. A browser failure falls back
to the lightweight selectable source, without exposing the generated Base64 payloads.
Delivered Markdown keeps full tables/code. External readers may filter data URLs.
The preview surface adds no horizontal gutters on top of the document's own content padding.

The frontend supplies one resolved `watermark` for HTML and images, preserved during format fallback.
The request follows the global Share watermark setting, enabled by default, unless the caller
explicitly selects `cherry` or `none`. `none` omits the brand footer from both the preview and saved
output, including Markdown. The image-only `imageFrame` uses the document background
and accessible label. Image content spans the output width with ordinary text padding and no decorative outer frame.
With Cherry watermarks, Markdown preview and saved text use the
same separated brand/time footer without logo bytes. The signature appears at the end of the
document. PNG pages do not include page numbers or reserve space for an ordinal footer.

The signature uses the same full-width white footer as painting and file image exports: the
original Cherry logo and Cherry Studio name on the left, with the time aligned to the right.
Shared geometry has a 48-point minimum height at 360 points wide and grows for wrapped text.
Image footers scale with capture width; responsive HTML retains the base footer typography. The timestamp uses `YYYY.MM.DD HH:mm` and stays frozen across format,
theme and thinking-option changes. Constant color tokens keep the signature white with black text.
Active saving/delivery holds its current presentation until the share sheet finishes.

## Image Capture

`useDocumentExportHtmlCapture` supplies document-specific scripts and page frames to the shared
[`HtmlCapture`](../../components/HtmlCapture/README.md) executor. The controlled WebView waits for
decoded assets, fonts and stable layout. Paged capture measures painted text/image ranges and fills
each image to the capture limit, moving the cut back only to avoid painted content. Message and
paragraph boundaries do not trigger early cuts. Headings stay with the
following line, normal table rows stay together, and oversized table rows can continue between
lines. Images are contained within a page. An indivisible object that cannot fit fails conversion
instead of losing content. Included process/reasoning details expand before capture; HTML retains
interactive disclosures and Markdown uses nested blockquotes. Fenced and indented code use
fixed-height labelled previews; inline code remains visible. Tables retain their header row and
column grid in every format. Images fit columns to the page width and wrap cell content; HTML and
Markdown previews use content-based column widths and allow horizontal scrolling for wide tables.
Failed image decoding and overwide formulas
fall back to readable resource entries or formula source before measurement. Code/resource headings
stay with their following line; code panels stay together. Clipped code does not contribute invisible
ranges to pagination. See [Document Export](../../../../docs/references/document-export.md)
for the shared content and degradation contract.

Paged capture reuses HTML image conversion's 8192-pixel edge budget. At 3x density, each content
slice is at most 2714 logical pixels high, with 16 pixels of top spacing and no page-number footer,
so output is 1080 pixels wide and at most 8190 pixels high. This is an application capture budget,
not a detected device maximum. The native surface
shows only that slice. It never allocates a full-document bitmap in paged mode. Each lossless PNG
is header-checked, handed to the backend, copied, and released before the next screenshot. The
60-second timeout resets for each page; the physical lease covers capture and file delivery across
both document export and HTML-file conversion. Closing unmounts the surface, but backend completion
waits for an in-flight capture or copy so cleanup cannot race a late write.

Single-long-image mode measures the available capture container and tiles both axes so each native
snapshot fits inside it at the same 3x density. A viewport change cancels the planned capture; an
explicit retry uses the new bounds. Tiles retain the document's original layout coordinates.
Skia drawing and PNG encoding run on a dedicated Worklets worker, and file writes yield between
bounded chunks. Cancellation waits for in-flight worker work before releasing native pixels or
scratch files. The final stitched bitmap still has no application height/pixel cap and retains
device-dependent allocation and decoding limits. It is not a streaming encoder. Source images also
retain device-dependent decode costs. Native acceptance must confirm that exported pixels have no
blank regions or tile seams.

## Preview And Delivery

`DocumentExportImagePreview` adapts the actual PNG files to the shared `ArtifactImagePages` viewer.
It no longer substitutes the source HTML for the image. Pages fit width and scroll vertically;
those above the viewer's original-pixel budget use display resolution. Zooming a page temporarily
disables list scrolling. Large single PNGs
use a viewport-sized browser showing the actual file, whose decoding/zoom quality still depends on
the browser. No full-height native Image view receives those files.

`appShell/fileExport.shareFiles` checks system availability before materializing and saving every
page in order, then opens one multi-file share sheet. A failed save can resume
using already committed pages. Saved pages remain in the file library after cancellation or route
exit. `react-native-share` supplies multi-file delivery and requires a rebuilt development client;
ordinary single-file delivery retains `expo-sharing`.

Image conversion/display failures prepare HTML; HTML failures retain the complete Markdown preview.
The menu and Share action describe the resulting format and show a fallback note. Backgrounding or
cancellation pauses conversion instead of selecting another format.

Regression coverage has been updated. Builds, type checks, tests and device acceptance were not run
for this change; previous simulator results do not validate this pipeline.

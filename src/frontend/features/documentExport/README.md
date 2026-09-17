# Document Export Page

Owns the fullscreen share layer, format/layout menus, preview and document capture strategy. The
app-shell handoff owns the selected source snapshots; this page never reads live chat state.
Closing retains the caller's selection. Dismissing the system share sheet returns to the optional
`returnTo` route, without claiming the recipient received the files.

Chat exports default to paged PNG images. Short content produces one image; longer content adds
pages without reducing resolution or omitting messages. The layout menu retains a single-long-image
option. HTML and Markdown remain available for every nonempty selection. Markdown stays in memory
until Share. An optional unchecked source toggle selects an alternate immutable document.

Images use a fixed 360-logical-pixel layout and 3x output density, independent of the device window.
Typography follows the frozen accessibility step; semantic colors follow the theme until delivery
starts. The existing numbered message treatment, Cherry signature and frozen local timestamp stay
inside the export. HTML retains its document presentation and window-derived width.

The frontend supplies one resolved `watermark` for HTML and images, preserved during format fallback.
The code-only request option defaults to `cherry`; `none` omits the brand footer from both the
preview and saved output, including Markdown. The image-only `imageFrame` uses the document background
and label. Image content spans the output width with ordinary text padding and no decorative outer frame.
With Cherry watermarks, Markdown preview and saved text use the
same separated brand/time footer without logo bytes. The signature appears at the end of the
document. PNG pages do not include page numbers or reserve space for an ordinal footer.

The signature uses the same full-width white footer as painting and file image exports: the
original Cherry logo and Cherry Studio name on the left, with the time aligned to the right.
Shared geometry has a 56-point minimum height at 360 points wide, scales with export width, and
grows for wrapped text. The timestamp uses `YYYY.MM.DD HH:mm` and stays frozen across format,
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
instead of losing content. Included process/reasoning details expand before capture; Markdown and
HTML retain their interactive disclosures.

Paged capture reuses HTML image conversion's 8192-pixel edge budget. At 3x density, each content
slice is at most 2714 logical pixels high, with 16 pixels of top spacing and no page-number footer,
so output is 1080 pixels wide and at most 8190 pixels high. This is an application capture budget,
not a detected device maximum. The native surface
shows only that slice. It never allocates a full-document bitmap in paged mode. Each lossless PNG
is header-checked, handed to the backend, copied, and released before the next screenshot. The
60-second timeout resets for each page; the physical lease covers capture and file delivery across
both document export and HTML-file conversion. Closing unmounts the surface, but backend completion
waits for an in-flight capture or copy so cleanup cannot race a late write.

Single-long-image mode still takes one full-height screenshot at the same density. It has no
application height/pixel cap and retains device-dependent capture and decoding limits. It is not a
streaming encoder. Source images also retain device-dependent decode costs.

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

# HTML Conversion

Status: implemented in source; native acceptance and performance measurements pending. No build,
type check, automated tests, or device verification were run for this implementation.

## Product Behavior

The HTML file viewer's overflow menu offers **Share as image** and **Share as PPT**. Truncated or empty
HTML cannot be shared in these formats. Conversion shows a compact spinner, progress label and cancel
action above the visible HTML content, then opens the system share sheet immediately through the
shared file export helper. The user stays in the HTML viewer throughout preparation and returns to
it when dismissing the share sheet.
The resulting PNG or image-based PPTX remains in the file library. Repeated share actions are
disabled until the current operation finishes, and cancelled conversions do not open a share sheet.

Conversion renders a fresh copy of the saved HTML at a desktop layout width of 1280 CSS pixels.
It does not serialize interactive state from the live preview. Authored images, fonts and scripts
load in the disposable WebView; images and fonts must finish loading before capture. Animations
and media pause before layout measurement.

- The code-only `watermark` option defaults to `cherry`; `none` skips the footer. There is no UI
  watermark control. PNG appends the footer to the whole-document capture. PPTX appends it only to
  the final slide, without adding a slide. Watermark selection applies before saving;
  later sharing reuses the completed bytes without adding another footer.
- Outermost `[data-slide]` or `.slide` elements are made visible in document order. Each becomes
  one PPT slide. Their widths and heights are measured in the original parent layout before any
  slides are rearranged; hidden slides are temporarily revealed for measurement. For PNG, these
  elements form one vertical document.
- Ordinary HTML without explicit slides is divided vertically into 16:9 pages. Pagination is
  geometric and can cut through text or tables; it does not redesign the content into a deck.
- PPTX uses a 16:9 canvas. Each captured page is fitted without stretching; differing aspect ratios
  have white margins. Text, charts and other elements are embedded in the image, not editable shapes.

Nested scroll containers, viewport-dependent reflow, script-driven layout changes, framework-specific
slide navigation, video and GPU surfaces are not guaranteed. Detected size changes, process failures
and resource failures abort conversion rather than saving a known incomplete result. Both native
platforms still need fidelity acceptance, including normal pages, hidden slides, long pages, remote
fonts/images, charts, cancellation, backgrounding and PowerPoint opening without a repair prompt.

## Ownership And Resource Use

`files` owns the conversion UI and native capture. Its temporary WebView keeps file access and
cookie sharing disabled and blocks navigation. Only this conversion surface has a message bridge:
messages carry a request id, bounded geometry and capture acknowledgments. Native code chooses the
page order and output paths; HTML never receives managed-file paths, credentials or backend APIs.
The interactive `FileHtmlBody` still has no message bridge.

`Backend.documentExport.convertHtml` owns serialization, cache files, managed persistence and
foreground cancellation. It admits one HTML conversion at a time and waits for cleanup before
admitting another. A screenshot is released after its consumer finishes, including late native
completion after cancellation. Temporary output is removed after success or failure; a committed
managed file outlives the viewer.

`capturePng` is shared with document export under `frontend/utils`. It uses native temporary PNG
files and checks actual PNG dimensions without decoding the bitmap in JavaScript. Captured pages
and signed PNG output are capped at 8192 pixels per edge and 16 million pixels; PPT is capped at
64 pages and output at 128 MiB. Watermark composition uses the shared Skia renderer and re-encodes only the image receiving a footer;
both the native capture and signed temporary file are released after consumption or cancellation.
The capture timeout is three minutes. PNG dimensions are independent of display density.

`imagePresentation` writes image-only PresentationML with the already-installed `fflate/browser`.
PNG data is copied in 256 KiB chunks into ZIP STORE entries. It avoids Base64, a complete in-memory
deck, and recompressing already-compressed PNGs. Slide metadata, a blank master/layout, a theme,
content types and relationships are small XML parts. No new dependency or native module is added.

## Selection Evidence

These are architectural conclusions, not a claim of a measured fastest implementation on mobile.

| Option | Evidence and decision |
| --- | --- |
| Native WebView + react-native-view-shot | Reuses the browser's painted content. The upstream documents iOS/Android WebView capture, including Android's non-collapsible wrapper requirement. Selected to preserve authored browser rendering and avoid DOM reconstruction. |
| SnapDOM | Its Chromium benchmark reports strong DOM capture performance. Its documented cross-origin resource and Safari limitations remain relevant to generated HTML; these figures do not establish native mobile latency. |
| Takumi WASM | A Rust layout/rendering engine with browser WASM bindings. It supports less CSS than a browser and accepts templates/node trees; it is not a capture of arbitrary running page scripts. |
| resvg WASM | A high-performance SVG rasterizer, not an HTML/CSS browser engine. It does not remove the HTML-to-renderable-content step. |
| PptxGenJS | A mature general presentation generator, including images. Its dependency resolution was rejected by this repository's trust policy for `undici-types@6.21.0`; no policy exception was added. Image-only output instead uses existing streaming ZIP support and a small PresentationML writer. |

Primary references:

- [react-native-view-shot interoperability and performance](https://github.com/gre/react-native-view-shot)
- [SnapDOM benchmark and limitations](https://github.com/zumerlab/snapdom)
- [Takumi architecture and WASM](https://github.com/kane50613/takumi)
- [resvg-js and WASM](https://github.com/thx/resvg-js)
- [PptxGenJS image API](https://gitbrent.github.io/PptxGenJS/docs/api-images/)
- [fflate streaming ZIP](https://github.com/101arrowz/fflate)
- [Microsoft PresentationML package creation](https://learn.microsoft.com/en-us/office/open-xml/presentation/how-to-create-a-presentation-document-by-providing-a-file-name)

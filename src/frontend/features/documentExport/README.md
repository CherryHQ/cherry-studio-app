# Document Export Page

Owns an independent fullscreen share layer, compact format menu, preview, bounded HTML capture and
a single Share action. The root stack presents it as a fullscreen modal without the regular route
header. The layer owns its safe areas, close action and the application theme. Closing returns to
the caller; once the system share sheet closes, the layer dismisses to the caller's optional
`returnTo` href instead, because neither platform distinguishes delivery from cancellation. Image
is the default format. The Markdown preview reads the frozen in-memory document without creating a
file.
It renders leaf prose with the existing Markdown component and composes the actual CherryUI
`MessagePart.Process` and `MessagePart.Reasoning` components for disclosures. Both start collapsed
and retain independent toggles; the source snapshot has no live chat reads.
HTML or WebP is generated when that format is selected, including the initial image preview. A source
may supply one initially unchecked option and its alternate document; changing it refreshes only the
selected format.

HTML and WebP receive resolved semantic colors and the accessibility typography scale. HTML keeps
the source's bubble/message hints. For images, the frontend supplies an optional `imageFrame`
presentation: theme-aware margins, content and text, numbered message headings and a compact Cherry
signature. Its 44-point baseline footer grows only when text needs more room. The brand name sits
on the left; a cropped original Cherry logo embedded as PNG bytes, a fine divider and the local
export time sit on the right. The timestamp uses `YYYY.MM.DD HH:mm` and is frozen when the layer
opens, including across format, theme and thinking-option changes. Colors follow theme changes;
only active saving/delivery holds its current presentation until the share sheet finishes. The backend lays out this frame inside
the captured document; it acquires no chat or frontend dependency. The preview displays that exact artifact with outer canvas space;
long images remain vertically scrollable. Ordinary documents retain their headings.

Process/reasoning hints also preserve the two disclosure levels in HTML. Both start collapsed;
only HTML and the native preview can expand them. WebP captures the collapsed summaries. Markdown
files retain nested `<details>` markup for readers that support it instead of flattening thinking
into ordinary headings and body text.

The page claims its sessions from the app-shell handoff, serializes superseded renders and closes
both sessions on route exit. Share materializes the selected format if necessary, persists it to the
file library and opens the system share sheet. Repeated sharing of the current artifact reuses its
saved entry; cancelling the sheet retains the file.

The capture WebView is a controlled, navigation-free surface below an opaque loading view. After
measuring the complete layout, short content keeps one image at 2x where possible, down to 1x.
Longer content is split into ordered images at 2x. Page ends prefer message boundaries; a message
larger than a page uses measured gaps between text lines. Oversized indivisible content is sliced
continuously without discarding pixels. Screen density only converts output pixels to native view
points. Each image retains the 16,383-point height, 16,383-pixel axis and 24-million-pixel allocation
bounds. One operation admits at most 128 output images.

Capture translates that same layout through tiles of at most 1,024 output pixels high, awaiting
native layout and browser painting before each screenshot. PNG tiles are captured sequentially, then
decoded one at a time into a CPU Skia surface and encoded as lossless WebP on one module-owned
Worklets runtime. Each image is encoded and its canvas released before the next image starts.
No full-document native view or GPU texture is allocated. The native lease remains held through
late cleanup. The 60-second timeout resets on tile progress, allowing long operations to finish
while cancelling stalled work. The encoder is imported synchronously for Worklets Bundle Mode.

The preview uses a recycling image list with known row heights and disk-only image caching, shows
the total image count, and offers one action to share every image. Progress reports the current
image and total. Output filenames carry ordered numeric suffixes when there is more than one.

Image generation or display failures automatically prepare HTML. Image resource limits and HTML
failures fall back to the complete in-memory Markdown preview. The menu and Share action describe
the actual format, accompanied by a document-ready note for conversion fallbacks. Cancellation and
backgrounding pause work instead of starting another conversion.

Multi-image capture, preview, persistence and native delivery still require device acceptance and a
development-client rebuild for the new local sharing module. Tests were added but not run. Earlier
simulator results do not validate this pipeline.

# Document Export Page

Owns an independent fullscreen share layer, compact format menu, preview, controlled HTML capture and
a single Share action. The root stack presents it as a fullscreen modal without the regular route
header. The layer owns its safe areas, close action and the application theme. Closing returns to
the caller; once the system share sheet closes, the layer dismisses to the caller's optional
`returnTo` href instead, because neither platform distinguishes delivery from cancellation. The
request supplies its allowed formats and initial format. A single chat message defaults to image;
multiple selected messages allow only HTML and Markdown and default to HTML. The Markdown preview
reads the frozen in-memory document without creating a file.
It renders leaf prose with the existing Markdown component and composes the actual CherryUI
`MessagePart.Process` and `MessagePart.Reasoning` components for disclosures. Both start collapsed
and retain independent toggles; the source snapshot has no live chat reads.
HTML or PNG is generated when that format is selected, including the initial preview. A source
may supply one initially unchecked option and its alternate document; changing it refreshes only the
selected format.

HTML and PNG receive resolved semantic colors and the accessibility typography scale. HTML keeps
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
only HTML and the native preview can expand them. PNG captures the collapsed summaries. Markdown
files retain nested `<details>` markup for readers that support it instead of flattening thinking
into ordinary headings and body text.

The page claims its sessions from the app-shell handoff, serializes superseded renders and closes
both sessions on route exit. Share materializes the selected format if necessary, persists it to the
file library and opens the system share sheet. Repeated sharing of the current artifact reuses its
saved entry; cancelling the sheet retains the file.

The capture WebView is a controlled, navigation-free surface below an opaque loading view. After
measuring the complete layout, image output stays in one file at a fixed 2x scale. Screen density
only converts output pixels to native view points. There is no additional layout-height or total
pixel limit, and longer content never lowers the output scale. PNG removes the 16K output edge
restriction; native capture and preview capabilities still determine practical limits.

Capture scales the original CSS layout into one full-height native view, awaiting matching native
layout and browser painting before taking a single PNG screenshot. Only its 24-byte header is read
to validate the signature and exact dimensions. The original lossless PNG is retained until the
session finishes copying it, with no full-file read, image decoding or second encoding step. The
native lease remains held through late cleanup. Capture has a 60-second timeout. The image preview
uses disk-only caching and scrolls through the single output image.

Image generation or display failures automatically prepare HTML. Image resource limits and HTML
failures fall back to the complete in-memory Markdown preview. The menu and Share action describe
the actual format, accompanied by a document-ready note for conversion fallbacks. Cancellation and
backgrounding pause work instead of starting another conversion.

The selection format policy and single-image pipeline still require device acceptance. Tests were
added but not run. Earlier simulator results do not validate the current behavior.

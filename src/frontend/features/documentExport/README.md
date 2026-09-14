# Document Export Page

Owns an independent fullscreen share layer, compact format menu, preview, bounded HTML capture and
a single Share action. The root stack presents it as a fullscreen modal without the regular route
header. The layer owns its safe areas, close action and the application theme; closing returns
to the caller's existing selection. Image is the default format. The Markdown preview reads the
frozen in-memory document without creating a file.
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
measuring the complete layout, it chooses 2x output where possible, falling back toward 1x for long
content. Screen density only converts output pixels to native view points; it never multiplies the
export budget. Logical height is capped at 16,383 points, WebP axes at 16,383 pixels, and final
allocation at 24 million pixels. Text is never reduced below 1x to force admission.

Capture translates that same layout through tiles of at most 1,024 output pixels high, awaiting
native layout and browser painting before each screenshot. PNG tiles are captured sequentially, then
decoded one at a time into a CPU Skia surface and encoded once as lossless WebP on one module-owned
Worklets runtime. No full-height native view or GPU texture is allocated. The native lease remains
held through late capture/encoding cleanup. Timeouts also cancel tile preparation. The encoder is
imported synchronously for Worklets Bundle Mode.

Output remains one image, with HTML offered beyond its capacity. Multi-image delivery is a future
option, not an implemented format. The current theme, selector and tiled-capture changes have not
had device acceptance; prior simulator results apply only to the previous capture implementation.

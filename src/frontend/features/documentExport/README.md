# Document Export Page

Owns an independent fullscreen share layer, compact format menu, preview, bounded HTML capture and
a single Share action. The root stack presents it as a fullscreen modal without the regular route
header. The layer owns its safe areas, close action and a locally scoped dark theme; closing returns
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
presentation: straight white margins, dark content, numbered message headings and a compact Cherry
signature. Its 52-point baseline footer grows only when text needs more room. Branding uses a cropped
copy of the original Cherry logo embedded as PNG bytes, plus the brand name, source domain and
localized message count. The backend lays out this frame inside the captured document; it acquires
no chat or frontend dependency. The preview displays that exact artifact with outer canvas space;
long images remain vertically scrollable. Ordinary documents retain their headings.

Process/reasoning hints also preserve the two disclosure levels in HTML. Both start collapsed;
only HTML and the native preview can expand them. WebP captures the collapsed summaries. Markdown
files retain nested `<details>` markup for readers that support it instead of flattening thinking
into ordinary headings and body text.

The page claims its sessions from the app-shell handoff, serializes superseded renders and closes
both sessions on route exit. Share materializes the selected format if necessary, persists it to the
file library and opens the system share sheet. Repeated sharing of the current artifact reuses its
saved entry; cancelling the sheet retains the file.

The capture WebView is a controlled, navigation-free surface, mounted below an opaque loading view
and separate from the authored-HTML file viewer. It releases late native files and limits physical
pixels before allocation. The image frame and logo are part of those bounds. WebP output is
one bounded image; larger content offers HTML. Native acceptance is still pending.

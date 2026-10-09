# Document Export Entry

`useDocumentExport().open` creates a source-neutral export session and opens `/document-export`.
Only a request ID enters navigation. This owner retains the transient handoff until the page closes,
rejects overlapping requests, releases abandoned navigation, and waits for session cleanup before
admitting the next request. The backend runtime remains the application-shutdown backstop.

The `watermark` option defaults to the global Share watermark setting, which starts enabled.
Explicit `cherry` or `none` overrides that preference; `none` omits the footer in every offered
format and its preview. The request retains the resolved choice; the export page has no separate
watermark control.

Image is the default format. A source can supply `allowedFormats` and `initialFormat`; the handoff
replaces an unsupported initial format with the first allowed format. The preview offers only
those formats. All chat selections start with image and offer image, HTML and Markdown. The export page owns
paged versus single-image layout; it defaults to pages.
An optional source-owned checkbox label and alternate input create
an unchecked session alongside the checked session; the checkbox starts unchecked. Creating either
snapshot only prepares text; the page renders the selected format on opening. Route exit disposes
both sessions. An optional `returnTo` href names where the page dismisses once the system share
sheet closes; without it the page stays open.

Conversion and persistence belong to `Backend.documentExport`; route UI and capture belong to
`features/documentExport`.

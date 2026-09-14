# Document Export

Document export is implemented as an application capability. Chat supplies the first document
adapter; the conversion service has no Agent, conversation, message-list, or navigation dependency.
Previous iOS simulator acceptance covered the original selection and capture flow. The summary
selector, selection format policy, theme-aware frame and scaled single-image capture described here
still require device acceptance on iOS and Android.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `shared/contracts/documentExport.ts` | Source-neutral document, targets, artifacts, caller-owned session and capture callback |
| `backend/services/documentExport` | Validation, conversion, bounded image resources, temporary files, explicit persistence and cancellation |
| `DocumentExportRuntime` | Foreground admission, live/closing sessions and host teardown |
| `bootstrap/composition/createBackend.ts` | Connects the runtime to a file-entry store bound to the originating database |
| `frontend/appShell/documentExport` | Opens the export page and hands off a transient request; URLs contain only its ID |
| `frontend/features/documentExport` | Format choice, preview, controlled HTML capture and user-triggered delivery |
| `frontend/features/chat/share` | Message selection and selected history reads, thinking inclusion policy and the chat-to-document adapter |
| `frontend/features/library` | The existing file stream, with an additional Sharing source filter |

The service follows [Code Organization](./code-organization.md),
[Runtime Ownership](./runtime-ownership.md), and the
[workflow contract rules](../../src/shared/contracts/README.md). `Backend.documentExport` is its
only frontend workflow boundary. This is a callable application capability; it is not registered as
an Agent tool or MCP tool.

## Pipeline

```mermaid
flowchart TD
    Source[Caller-owned content selection] --> Document[ExportDocument]
    Document --> Normalize[Validate and copy input]
    Normalize --> Markdown[Markdown]
    Normalize --> Resources[Prepare image resources]
    Resources --> HTML[Controlled HTML and MathML]
    HTML --> Capture[Page-owned PNG capture]
    Markdown --> TextPreview[In-memory text preview]
    HTML --> Preview[Temporary artifact and preview]
    Capture --> Preview
    TextPreview --> Materialize[Share creates Markdown file]
    Materialize --> Save[Explicit Share]
    Preview --> Save
    Save --> Library[Managed file with document-export source]
    Library --> Delivery[Retained readable copy and system share sheet]
```

There is an explicit target switch, not a plugin or job registry. Markdown/HTML can be produced by a
programmatic caller without mounting a page. Image output requires a capture callback; the backend
never imports a React component, holds a native view reference, or opens navigation.

## Document And Session Contract

The document has an optional title, ordered sections, optional section headings/metadata, and
blocks of plain text, Markdown, images, attachments, details, or references. Sections can carry
source-owned bubble/message presentation hints without exposing chat models to the exporter.
Images refer to entries in its
asset map. Asset sources are managed file IDs or remote image URLs. Ordinary Markdown image
references are discovered by the Markdown parser when rendering HTML, so code examples do not
cause downloads. There is no special inline asset URL scheme in this implementation; callers use
explicit image blocks for managed files.

The convenience input `{ kind: 'markdown', source, title? }` normalizes to the same document model.
Input values are copied and deeply frozen before use; later mutation by the caller cannot change the
source text. The session exposes this immutable document for structured native previews.
Resources become byte snapshots on their first successful read. Failed image reads stay retryable.

```ts
const session = backend.documentExport.createSession({
  kind: 'markdown',
  source: '# Notes\n\nDocument content.',
});
try {
  const previewText = session.markdown; // No files or image reads.
  // An explicit persistence/delivery action materializes the file.
  const artifact = await session.render({ format: 'markdown' });
  const file = await session.save(artifact); // One managed file for the current artifact.
} finally {
  await session.dispose();
}
```

`render` accepts an optional abort signal and semantic progress callback. HTML/image targets require
explicit presentation values: logical width, the resolved base/sm/lg/xl typography roles, and
resolved semantic colors, including user bubbles, code surfaces and secondary text. The export
page freezes width, typography and export time at opening. Theme changes regenerate the preview;
the active presentation is held while saving or delivering so the current file cannot be replaced. Programmatic input presentation is validated and copied by the HTML renderer.

Image presentation may also supply an `imageFrame` with resolved frame/text colors, an embedded PNG
logo, brand name, localized label and timestamp. These are presentation data, independent of the source
document. The renderer copies and validates them, escapes text, and includes the complete frame
inside the measured and captured `main` element. The frontend supplies this treatment only for the
image target; Markdown and HTML retain their existing document representations.

Every artifact contains one file descriptor. Markdown/HTML artifacts also contain their source
text; image artifacts contain their width and height. Artifacts also contain structured
image/formula issues. Artifacts and file descriptors are frozen.
The session admits one operation at a time, including saving, and accepts only its current artifact
for persistence. A new completed render replaces the previous temporary output. Rendering Markdown
again reuses its current file and saved entry while they remain available.

## Output Behavior

| Content | Markdown | HTML and long image |
| --- | --- | --- |
| Plain user text | Escape formatting markers, preserve line breaks | Preserve literal text and whitespace; HTML uses a right-aligned bubble, framed images use numbered message rows |
| Prose, tables, lists, code | Preserve authored Markdown | Render through `markdown-it`; code wraps and tables fit the document width |
| Math | Preserve source | KaTeX produces MathML with `trust: false` and bounded expansion; unsupported formulas remain visible as source |
| Managed images | Alt/name placeholder | Embed validated PNG/JPEG bytes or show a placeholder |
| Remote images | Keep eligible external URLs | Fetch without credentials, enforce bounds and embed, or show a placeholder |
| Attachments | Name/type and eligible external link | Name/type and eligible external link; attached documents are not rasterized |
| Included process/details | Nested, initially collapsed `<details>` retain the summary and content | HTML retains expandable collapsed details; PNG displays the collapsed summary |
| References | Portable numbered links | Numbered links and a readable URL list, including in the image |

HTML contains inline CSS and embedded displayed resources. MathML needs no downloaded fonts or
runtime script. Raw authored HTML is escaped; generated links admit only HTTP, HTTPS, and mailto
without URL credentials. A content security policy disables scripts, remote subresources and forms.
The preview disables JavaScript. The separate capture surface permits only its injected readiness
protocol and blocks navigation, file access, cookies and new windows.

Markdown is source text rather than a reconstruction of rendered HTML. Authored Markdown remains
unchanged; generated metadata and structured blocks are escaped. Managed image/attachment blocks
do not expose sandbox paths.

Chat HTML follows the native message hierarchy: 16-point gutters, an 88%-width user column,
question attachments above the bubble, compact assistant labels, and full-width answers. They omit
the extra article title and section dividers. The page supplies CherryUI's resolved accessibility
type scale and the existing chat/code/surface tokens for both light and dark themes. Paragraphs,
headings, code blocks, tables and process disclosures follow the native message spacing and surfaces.
The native Markdown preview composes the same CherryUI `MessagePart.Process` and
`MessagePart.Reasoning` components used in chat. Process summaries use the transcript's elapsed-time
label; the nested reasoning row uses its completed-thinking label. HTML follows the same two
initially collapsed levels, process separator, compact nested rows and reasoning rail. PNG captures
the collapsed summary rather than exposing hidden thinking as plain text.

The parser is `markdown-it` 15.0.1. Capture uses `react-native-view-shot` 5.1.0, matching Expo SDK 57.
Both platforms capture the complete, scaled native view once as a lossless PNG and keep that file
for delivery. The frontend reads only the first 24 bytes to validate the PNG signature and output
dimensions; it does not load or decode the full file or run a second encoder. The native screenshot
remains alive until the session finishes copying it or cancellation settles, then its capture file
is released. Published files use `.png` and `image/png`. Math uses KaTeX. This does not imply full
parity with the native Markdown renderer.

## Limits And Capture

The image format is **one lossless PNG image at a fixed 2x scale**, produced from one complete screenshot.
Multiple selected chat messages support only HTML and Markdown. Capture failures automatically
prepare HTML; image-resource limits or failed HTML conversion use the complete in-memory Markdown preview. Background/cancelled work
pauses instead of triggering another conversion.

| Resource | Limit |
| --- | --- |
| Document text | 500,000 UTF-16 code units across admitted input values |
| Sections | 128 |
| Input structure | 10,000 visited values; depth at most 24 before recursive schema parsing |
| Image sources | 32 per HTML/image render, including discovered Markdown images; source admission still permits a text export |
| Encoded image | 4 MiB each; 16 MiB total prepared bytes |
| Decoded image | 8 million pixels each; 16 million total prepared pixels |
| Source dimensions | At most 8192 pixels on each axis |
| Supported sources | Still PNG and JPEG; animated PNG, GIF, WebP and SVG use a placeholder |
| Embedded image text | 24 MiB of base64 references per output, including repeated references |
| Remote read | 15 seconds; redirects rejected; response stream stopped at the byte cap |
| HTML width / typography | 280–800 logical pixels / 12–40 pixel type, with 12–56 pixel line heights |
| Capture per image | No application-imposed layout-height or total-pixel cap; native capture and preview capabilities determine practical limits |
| Output images | One per operation; capture failures use a document preview |
| Output scale | Fixed 2x; never reduced to fit longer content |
| Capture readiness/native wait | 60 seconds; physical lease held until native work settles |
| Runtime sessions | At most 4 live or closing sessions; one interactive request |

Output dimensions are twice the measured layout dimensions, independent of the device pixel ratio.
The capture never lowers resolution to fit a height or memory budget. PNG output has no 16K edge
restriction. The full native screenshot, native PNG encoder and image preview still allocate memory
in proportion to the output size; format support does not guarantee arbitrary dimensions on a device.

The surface waits for fonts, decoded images and stable layout, then chooses output dimensions before
allocating the full native surface. It preserves the original CSS width and scales the layout to
the admitted output pixels, without reflowing text or multiplying the bitmap by screen density.
It waits for matching native layout and browser painting before taking one screenshot, then checks
the dimensions recorded in the PNG header. The wrapper is non-collapsible and disables clipping
removal. The preview displays the actual final PNG. Cancellation never publishes a late result.

Messages from the WebView must match the active request and expected dimensions. A module-local
capture lease prevents another physical capture from reusing a closing surface. Abort/timeout has
an immediate logical result; a late native file is released instead of being published. Native work
keeps its lease until its actual promise settles. These controls do not establish that off-screen
WebView rendering works on all devices; only the local iOS text-message scenario has been verified.

## Lifetime And File Library

- `DocumentExportRuntime` is a Gate lifecycle service depending on `DbService`. Initialization
  subscribes to app state; it does not parse documents, fetch resources or mount a capture surface.
- Background/inactive transitions cancel active operations and reject new work. Returning to the
  foreground permits an explicit retry; generation never restarts silently.
- The runtime closes admission before teardown, disposes every session, and retains closing
  sessions until cleanup settles. Managed-file reads/writes use the original host's database,
  so late cancellation cannot redirect an old operation into a replacement host.
- Session scratch and its current preview live under the OS cache. A replacement render deletes
  the previous completed preview; route exit or disposal deletes session scratch. Abandoned cache
  files after process death remain disposable OS-managed cache.
- The app-shell request has a 30-second deadline before route handoff. Missing requests after
  process death show an unavailable state. Route cleanup is deferred one task so development
  remounts can reclaim the same request, then it waits for disposal before admitting another.
- The source supplies allowed formats and an initial format. Single-message chat exports default
  to PNG; multi-message selections allow HTML and Markdown and default to HTML. Selecting Markdown displays the structured
  document from memory, retaining native process/reasoning disclosures and using Markdown only for
  leaf prose, without generating any output file. A source can supply one initially unchecked option
  and an alternate document; changing it renders only the current format. Both sessions close with
  the route.
- **Share first commits the final artifact into the existing managed file store.** It is the page’s
  only delivery action, including for Markdown. Repeated actions reuse the saved file for the
  current artifact. Changing formats creates a new artifact; reopening an export is a new session and
  may create another file.
- Saved files have `provenance: 'document-export'`. This extends the existing source enum without
  adding a column or database migration; older files retain their existing provenance. Sharing an
  existing managed file does not change its provenance.
- Sharing is an additional source filter over the library's existing cursor stream. Exported PNG images
  also remain in Images, while HTML/Markdown remain in Documents. There is no second table or
  separate permanent directory for sharing.
- Permanent files follow the existing [file model](./data/file-model.md): only explicit user
  deletion removes them. Closing a preview, deleting a conversation, or dismissing a share sheet
  does not delete saved files.
- System delivery uses the shared `FileEntryPreview.shareFile` helper. It prepares a readable
  cache copy before opening the system share sheet and retains the copy for late recipient reads. Share-sheet
  completion does not claim delivery to another person. Cancelled sharing still leaves the saved
  file in Sharing. Existing file-viewer actions provide saving images to Photos and system opening.

No background jobs, process-death resume, content-hash deduplication, hosted links, PDF conversion,
or attachment bundles are introduced.

## Chat Integration

The assistant toolbar opens `/chat-share` with the session and clicked answer IDs. The answer
starts selected. This independent, paginated list shows user/assistant roles, timestamps and at
most four lines from a 240-character excerpt. Pending/streaming messages cannot be selected and
system messages are excluded. Whole-row presses toggle selection. No Markdown renderer, tool
payload or media view is mounted inside a selection row.

The original chat list and composer remain mounted with unchanged layout and draft state. Only the
selected summary row and count subscribe to an individual toggle. Cancel/native Back closes the
selector. Closing the export preview retains the selection; changing route identity resets it. The
selector has no per-row local state and can recycle rows by message ID.

Confirmation resolves exactly the selected persisted messages in one bounded ID query,
and supplies them in chronological order to `/document-export`. Same-turn questions are included
only when selected. Unselected pending messages do not block export. A conversation can contain more
than 128 messages; the existing section limit applies only to the selection. Missing/unfinished
selected messages, failed reads, and exceeded content budgets produce localized feedback without
silently dropping content. Cancelling preparation or unmounting/backgrounding stops pending reads.
Closing the preview keeps the selection editable. Once the system share sheet closes, the preview
dismisses to the chat route the source supplied. Neither platform reports whether the user
delivered or cancelled, so both outcomes return to the chat. The preview is an independent
fullscreen modal using the application theme and its own close action.
Two or more selected messages default to HTML and offer only HTML and Markdown in the format menu.
A single selected message defaults to PNG and offers all three formats. The request preserves this
format policy when thinking content is toggled. Images include straight
theme-aware margins, conversation content and a compact signature: the Cherry Studio name on the left,
with the Cherry logo, a fine vertical divider and local export time on the right. The timestamp uses
`YYYY.MM.DD HH:mm` and is frozen at opening across both document snapshots and format changes.
The baseline signature area is 44 logical points and can grow for larger or wrapped text. The displayed
preview uses the generated image, including the selected message and branding, and scrolls
vertically. Images exceeding the single-file bounds fall back to a document preview.

Visible thinking content is omitted by default. When present, the source supplies two immutable
document snapshots and an option label so the preview can include that content through a switch without acquiring chat
dependencies. Only the selected format is rendered for the selected snapshot.

The adapter follows the chat article's final-answer boundary. Earlier prose and reasoning are
process content; the last visible text is a final answer only when no later process part follows
it. File parts remain after the answer. The thinking option includes reasoning, intermediate prose and
readable tool names, never raw tool inputs, result envelopes, credentials or diagnostics.

Persisted `[cite:id]` references from web search/fetch outputs become ordinary numbered links.
Code examples and unknown markers remain source text. File references become document-local assets.
The generic export page has no live chat subscription and cannot load a conversation on its own.

## Validation Status

Behavior tests were added for source copying/limits, Markdown and HTML behavior, resource limits,
asset retry/reuse, temporary/permanent lifetime, stale artifact rejection, asynchronous capture
copying, late cancellation cleanup, lifecycle admission/teardown, selected-message reads and file source persistence. Markdown lifetime
coverage also checks that preview creates no files or asset reads and repeated sharing reuses its file.
Preview-hook coverage includes lazy conversion, option changes and stale-format rejection; request
coverage checks disposal of both option snapshots. PNG coverage checks output metadata, complete-image
capture, header reads and validation, temporary-file ownership and late native cancellation cleanup.
The library filter and existing serialization/composition fixtures were updated as well.

The latest changes add regression cases for fixed output clarity, screenshots beyond 16K,
source-file cleanup, invalid PNG headers, cancelled native work, bounded excerpts and
selection subscription isolation. Changed-file formatting and lint passed. Tests, type checks,
builds and device acceptance were not run for these changes.

The earlier implementation was exercised on an iPhone 17 Pro simulator with an iOS development
client. Those results do not validate the new selector, theme behavior or scaled capture pipeline.

When authorized, acceptance should cover both iOS and Android, light/dark themes, different pixel
ratios, long text, wide tables/code, inline/display math, multiple images, rejected/failed resources,
backgrounding, repeated actions, actual PNG dimensions, and a recipient opening the shared file. Follow
[Testing And CI](../guides/testing-and-ci.md) and
[Parallel Device Testing](../guides/parallel-device-testing.md).

Regression cases also cover the 128-message selection limit, HTML defaults and allowed formats for
multiple messages, single-message image defaults, document-only fallback and stale-request
cancellation. Tests, type checks, native builds and device acceptance have not been run for the
format-policy change.

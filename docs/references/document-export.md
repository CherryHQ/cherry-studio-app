# Document Export

Document export is implemented as an application capability. Chat supplies the first document
adapter; the conversion service has no Agent, conversation, message-list, or navigation dependency.
An authorized iOS simulator development build verifies local text-message selection, WebP capture,
the branded fullscreen preview and returning to edit selection. Android and the broader capture
matrix remain unverified.

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
    HTML --> Capture[Page-owned bounded capture]
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
  const file = await session.save(artifact);
} finally {
  await session.dispose();
}
```

`render` accepts an optional abort signal and semantic progress callback. HTML/image targets require
explicit presentation values: logical width, the resolved base/sm/lg/xl typography roles, and
resolved semantic colors, including user bubbles, code surfaces and secondary text. The export
page freezes those values at opening so a system theme or orientation transition cannot replace a
file during delivery. Programmatic input presentation is validated and copied by the HTML renderer.

Image presentation may also supply an `imageFrame` with resolved paper/ink colors, an embedded PNG
logo, brand name and localized labels. These are presentation data, independent of the source
document. The renderer copies and validates them, escapes labels, and includes the complete frame
inside the measured and captured `main` element. The frontend supplies this treatment only for the
image target; Markdown and HTML retain their existing document representations.

An artifact contains one file descriptor plus Markdown text, HTML text, or image dimensions. It also
contains structured image/formula issues. The returned artifact and file descriptor are frozen.
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
| Included process/details | Nested, initially collapsed `<details>` retain the summary and content | HTML retains expandable collapsed details; WebP displays the collapsed summary |
| References | Portable numbered links | Numbered links and a readable URL list, including in the image |

HTML contains inline CSS and embedded displayed resources. MathML needs no downloaded fonts or
runtime script. Raw authored HTML is escaped; generated links admit only HTTP, HTTPS, and mailto
without URL credentials. A content security policy disables scripts, remote subresources and forms.
The preview disables JavaScript. The separate capture surface permits only its injected readiness
protocol and blocks navigation, file access, cookies and new windows.

Markdown is source text rather than a reconstruction of rendered HTML. Authored Markdown remains
unchanged; generated metadata and structured blocks are escaped. Managed image/attachment blocks
do not expose sandbox paths.

Chat HTML and WebP follow the native message hierarchy: 16-point gutters, an 88%-width user column,
question attachments above the bubble, compact assistant labels, and full-width answers. They omit
the extra article title and section dividers. The page supplies CherryUI's resolved accessibility
type scale and the existing chat/code/surface tokens for both light and dark themes. Paragraphs,
headings, code blocks, tables and process disclosures follow the native message spacing and surfaces.
The native Markdown preview composes the same CherryUI `MessagePart.Process` and
`MessagePart.Reasoning` components used in chat. Process summaries use the transcript's elapsed-time
label; the nested reasoning row uses its completed-thinking label. HTML follows the same two
initially collapsed levels, process separator, compact nested rows and reasoning rail. WebP captures
the collapsed summary rather than exposing hidden thinking as plain text.

The parser is `markdown-it` 15.0.1. Capture uses `react-native-view-shot` 5.1.0, matching Expo SDK 57's
bundled native-module version. Android 10+ captures lossless WebP directly at quality 100 using
view-shot's historical `webm` option. iOS and older Android capture a temporary PNG, then the
existing Skia encoder converts it to lossless WebP at quality 100 on a job-owned Worklets runtime.
This keeps decoding/encoding off the JS and UI threads. Both temporary files are released after
the session copies the WebP, or after a failed/cancelled operation settles. The callback returns
WebP bytes; published files use `.webp` and `image/webp`. Math uses the existing KaTeX dependency.
These choices do not imply full visual parity with the native chat Markdown renderer.

## Limits And Capture

The initial image format is **one bounded lossless WebP**, with no stitching or multi-page output. A document
that exceeds the budget offers HTML; Markdown remains available in the format menu.

| Resource | Limit |
| --- | --- |
| Document text | 500,000 UTF-16 code units across admitted input values |
| Sections | 128 |
| Input structure | 10,000 visited values; depth at most 24 before recursive schema parsing |
| Image sources | 32, including discovered Markdown images |
| Encoded image | 4 MiB each; 16 MiB total prepared bytes |
| Decoded image | 8 million pixels each; 16 million total prepared pixels |
| Source dimensions | At most 8192 pixels on each axis |
| Supported sources | Still PNG and JPEG; animated PNG, GIF, WebP and SVG use a placeholder |
| Embedded image text | 24 MiB of base64 references per output, including repeated references |
| Remote read | 15 seconds; redirects rejected; response stream stopped at the byte cap |
| HTML width / typography | 280–800 logical pixels / 12–40 pixel type, with 12–56 pixel line heights |
| Capture | At most 8192 logical pixels high, 16383 physical pixels on either axis, and 12 million physical pixels |
| Capture readiness/native wait | 30-second logical timeout |
| Runtime sessions | At most 4 live or closing sessions; one interactive request |

Physical capture admission uses the device pixel ratio before expanding the native view. The pixel
budget can therefore produce a lower height limit on high-density devices. Reducing the WebP's
encoded size is not treated as reducing bitmap memory.

The capture surface waits for image decoding, fonts and stable layout over multiple animation
frames. It measures the document, checks width/height/pixel limits, expands the mounted wrapper,
then waits for the resized native layout and a second stable-layout report before capture. The
wrapper is non-collapsible and its parent disables clipped-subview removal. The preview displays
the produced WebP, not an HTML approximation.

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
- Opening the page renders a WebP image by default. Selecting Markdown displays the structured
  document from memory, retaining native process/reasoning disclosures and using Markdown only for
  leaf prose, without generating any output file. A source can supply one initially unchecked option
  and an alternate document; changing it renders only the current format. Both sessions close with
  the route.
- **Share first commits the final artifact into the existing managed file store.** It is the page’s
  only delivery action, including for Markdown. Repeated actions on the current artifact reuse its
  saved entry. Changing formats creates a new artifact; reopening an export is a new session and
  may create another file.
- Saved files have `provenance: 'document-export'`. This extends the existing source enum without
  adding a column or database migration; older files retain their existing provenance. Sharing an
  existing managed file does not change its provenance.
- Sharing is an additional source filter over the library's existing cursor stream. Exported WebP images
  also remain in Images, while HTML/Markdown remain in Documents. There is no second table or
  separate permanent directory for sharing.
- Permanent files follow the existing [file model](./data/file-model.md): only explicit user
  deletion removes them. Closing a preview, deleting a conversation, or dismissing a share sheet
  does not delete saved files.
- System delivery uses the shared `FileEntryPreview.shareFile` helper. It creates a readable cache
  copy and retains it after the sheet closes, since recipients can read later. Share-sheet
  completion does not claim delivery to another person. Cancelled sharing still leaves the saved
  file in Sharing. Existing file-viewer actions provide saving images to Photos and system opening.

No background jobs, process-death resume, content-hash deduplication, hosted links, PDF conversion,
attachment bundles, or multi-image sharing are introduced.

## Chat Integration

The assistant message toolbar's share button enters selection on the existing message list. The
clicked answer starts selected, and each user/assistant row displays a left selection control.
Pending messages cannot be selected; system rows have no selection control. Users can continue
reading and paginating history while their selected IDs remain stable across row unmounts.

The composer stays mounted but hidden behind bottom controls for cancel, selected count and confirm.
Cancel or Android Back exits selection; leaving the Session resets it. Confirmation is disabled for
an empty selection and while preparation is pending. No export preview opens before confirmation.
There is no sidebar sharing action, separate message-selection route, or timestamp option.

Confirmation resolves exactly the selected persisted messages, stops pagination when all are found,
and supplies them in chronological order to `/document-export`. Same-turn questions are included
only when selected. Unselected pending messages do not block export. A conversation can contain more
than 128 messages; the existing section limit applies only to the selection. Missing/unfinished
selected messages, failed reads, and exceeded content budgets produce localized feedback without
silently dropping content. Cancelling preparation or unmounting/backgrounding stops pending reads.
Returning from the preview keeps the selection editable. The preview is an independent fullscreen
modal with a local dark theme and its own close action, rather than the ordinary route header.
WebP is the default; a compact menu switches to Markdown or HTML on demand. Images include straight
white margins, dark conversation content and a compact Cherry logo/name/source signature. The
baseline signature area is 52 logical points and can grow for larger or wrapped text. The displayed
preview uses the generated file, including all branding; long images scroll vertically.

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
coverage checks disposal of both option snapshots. WebP coverage checks output metadata, per-axis
limits, direct Android capture, lossless encoder options, temporary-file ownership and cancellation
during capture/encoding. The library filter and existing
serialization/composition fixtures were updated as well.

Formatting and lint passed for the changed files. Full formatting also passed. Full lint initially
reported seven unresolved imports because the workspace lacked the existing `ai-core` build output;
after copying existing package artifacts with identical source/configuration and rerunning ESLint
without its stale cache, lint completed with only existing repository warnings. Automated tests and
type checks have not been run. A local EAS `development-simulator` Debug build completed, and the
isolated iPhone 17 Pro simulator running iOS 26.5 verified a fresh installation with four local
illustrative messages, without imported history, credentials or model calls. The selected messages
generated a 1206 × 2040 WebP containing the Cherry signature. The preview scrolls, closing preserves
all four selections, and editing the selection to two messages generates another preview. Runtime
verification caught and fixed the missing confirmation translation and an asynchronous encoder
import that prevented Worklets Bundle Mode from resolving the encoder after launch. Formatting and
lint passed again after these fixes; automated tests, type checks, Android and delivery to a recipient
remain unverified.

When authorized, acceptance should cover both iOS and Android, light/dark themes, different pixel
ratios, long text, wide tables/code, inline/display math, multiple images, rejected/failed resources,
backgrounding, repeated actions, actual WebP bounds, and a recipient opening the shared file. Follow
[Testing And CI](../guides/testing-and-ci.md) and
[Parallel Device Testing](../guides/parallel-device-testing.md).

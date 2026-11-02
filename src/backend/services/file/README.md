# Document Extraction

`fileContent.extractDocument` is the managed-file boundary for explicit local document tasks.
It retains the existing AnyDoc, native PDF and image readers and shares the serial OCR queue,
consumer cancellation and disposable cache in `fileTextExtraction.ts`. Ordinary attachment and
`read_file` behavior is unchanged. Users provide a file through chat attachments or the existing
[preview selection handoff](../../../frontend/features/files/README.md); the Agent requests
structured content when needed. There is no separate local extraction screen.

## Tasks and sources

The shared `documentExtraction` contract accepts a managed entry ID and `document`, `tables`,
`formulas`, `fields` or `question`. PDF requests select at most eight real source pages within the
first 100; omission selects the first eight and returns `nextPage` when more remain. Invalid source
pages fail. Native Office blocks keep JSON pointers into the unchanged AnyDoc IR, not invented
PDF pages or Excel addresses. Office document results retain the original IR and list embedded
assets by reference. Unsupported blocks retain their raw data with an incomplete status.

Ordinary PDF document tasks use readable text layers. Explicit table/formula/field/question tasks
render selected pages even when text exists. Images use the selected OCR engine; structural tasks
require a downloaded and enabled Xiaomi-OCR-0 or OvisOCR3 model. Native Office tables and math runs use AnyDoc
without loading an OCR model. Office fields/questions require an exact embedded image `assetRef`.
The asset is obtained from the authorized document, size checked and temporarily stored under a
generated name. It cannot supply an arbitrary path or URL.

Whole-page output retains validated cell origins and spans plus raw output and LaTeX. Xiaomi uses
OTSL; Ovis uses HTML tables, including row/column spans and decoded text entities.
Independent tables, including cross-page tables, remain separate. Field tasks use a dedicated
prompt and constrained JSON; values stay strings or null, preserving leading zeroes and units.
Question tasks return an answer about visible document content. Ovis uses its trained VQA prompt;
the final boxed answer is projected separately while reasoning remains in the raw output.
Unfinished boxes or malformed tables are marked incomplete. Ovis image-crop placeholders are
removed from the reading view (no crop files are created); repeated-tail cleanup retains the raw
response and marks the unit truncated. Legal JSON and a complete
status do not establish recognition accuracy.

Each unit records its actual engine and completion, truncation, invalid-structure, unavailable or
unrecognized status. Source metadata includes a SHA-256. Cache keys include task, page selection,
field names, question, asset digest/parser version and task/model versions. Last-consumer cancellation
stops inference; the inference slot and temporary asset remain owned until native cleanup settles.

## Model selection

General settings keeps one recognition row, with system, Xiaomi-OCR-0 and OvisOCR3 choices in its
compact sheet. Each model owns independent verified downloads, resume state and deletion. A
completed download enables that model; deleting the selected model restores system recognition.
Deleting another model leaves the selection and active inference unchanged. Models use different
versioned directories and cache identities, so existing Xiaomi downloads and cached results remain
usable. One shared extraction queue and per-request context release prevent concurrent model loads.

Ovis uses the pinned community Q4_K_M conversion plus its BF16 vision projector, totaling
736,644,000 bytes. See `localOcrModel.ts` for immutable revisions and checksums. It reuses the installed
`llama.rn` runtime and native image/PDF bridge without additional dependencies. This integration is
single-page Markdown/HTML parsing, fields and VQA, not Ovis' optional layout, figure-captioning or
cross-page reconstruction pipelines.

## Agent and Office composition

`extract_document` uses the turn's `WorkspaceFileAccess` authorization before every read, including
continuations. It returns only requested content by default; `include_raw` adds recognition output.
Small outputs return `data`; large outputs return bounded `json-fragment` text. Continue using
`nextOffset` and identical options, join fragments and parse JSON once. No image pixels, new file
grants or managed output files are produced by extraction.
The collapsed chat tool group shows only a short queue status or page progress during extraction;
raw results stay in the existing tool details. Office-generated files use the existing file result UI.

In Code Mode, pass complete table data directly to `create_workbook`: allocate a rectangular array
of null cells, set each origin to its original `text`, and map spans larger than one to `merges`.
Keep every table in its own sheet. To populate an existing workbook, first use
`inspect_office_file`/`read_office_content`, then map extracted fields to verified cell anchors and
call `edit_workbook` with the target's source hash. An AnyDoc pointer is not an Excel cell address.
All writes remain separate Office operations with their existing authorization and publication.

Recognition returns after releasing its model, so a subsequent Office operation can generate a
file without holding that model in memory. `create_workbook` supports validated merges and literal
strings; `create_document` supports editable paragraphs and ordinary tables. Reconstructed formulas
remain LaTeX text. Original typography, page layout and editable mathematical objects are not
reconstructed. The Agent must inspect unit status before using extracted data; structural completion
does not guarantee recognition accuracy. Office input, cell-count and file-size limits still apply.

Running an extraction tool inside a chat does not make that conversation offline: its ordinary
attachments may already have reached the
selected model. Automatic layout detection and region selection are outside this implementation;
an image can be cropped to a new copy using the existing editor before extraction.

## Acceptance

Regression sources cover source locations, grids, field strings, request validation, cache isolation,
cancellation/cleanup, authorization and bounded Unicode continuations. The Office owner separately
covers merged-range validation and generation.
They were added without running tests, type checks, builds or device/UI acceptance. Native page
selection and local model tasks require a development client containing the OCR bridges and
`llama.rn`, followed by authorized real-sample acceptance
on both platforms. Phone memory, speed and recognition quality remain unmeasured. See the
[native module](../../../../modules/pdf-text-extractor/README.md) and
[Office owner](../office/README.md).

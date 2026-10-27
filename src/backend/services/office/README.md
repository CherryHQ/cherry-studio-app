# Office Files

This module generates, inspects, reads and patches Office files in the native QuickJS compute pool.
The Agent adapters in `ai/agent/tools/officeTools.ts`, `officeEditTools.ts` and `officeScriptTool.ts` own file authorization,
source hashes, image preparation and managed-file publication. Computations receive validated data
and read host-chosen input files and write one output file through the sandbox's `__files` port;
they cannot name paths and have no network port. The existing preview WebView supplies selections.
There is no remote service or job queue.

## Implemented Surface

| Tool | Supported input | Output |
| --- | --- | --- |
| `create_document` | Paragraphs (`normal`, `title`, `heading1`, `heading2`), ordered/unordered lists, rectangular tables, PNG/JPEG images | DOCX |
| `create_workbook` | Unique named sheets, rectangular rows of string/number/boolean/null cells, column widths, numeric formats and PNG/JPEG images anchored to cells | XLSX |
| `create_presentation` | Widescreen title, bullet, table and image slides; light/dark theme | PPTX with editable supported elements |
| `inspect_office_file` | Managed source, `kind` (`content` or `images`), item offset/limit and optional PPTX shape offset | Content outline or picture anchors/metadata and replacement eligibility; source SHA-256 |
| `read_office_content` | Managed source and one structural anchor | Exact paragraph text or up to 1000 cells with saved formula values; source SHA-256 |
| `edit_document` | Version 1, source/hash, filename, exact paragraph replacements and/or existing picture replacements | New DOCX copy, retaining surrounding runs, hyperlinks and picture layout |
| `edit_workbook` | Version 1, source/hash, filename, one sheet, up to 1000 scalar cell edits and/or existing picture replacements | New XLSX copy, retaining untouched package parts |
| `edit_presentation` | Version 1, source/hash, filename, slide/shape/table-cell paragraph replacements and/or existing picture replacements | New PPTX copy, retaining surrounding runs, hyperlinks and picture layout |
| `run_office_script` | Output filename, model-written JavaScript and up to 50 authorized managed file ids | New DOCX, XLSX or PPTX produced by the script |

Creation inputs have `filename` and `spec`, and every creation spec requires `version: 1`.
Edit inputs require top-level `version: 1`. Unknown properties and
invalid XML text are rejected. Workbook strings are literal, including strings beginning with `=`;
there is no formula authoring or calculation. Creation images require an authorized managed `file_entry_id`,
`width_px` and `height_px`; these dimensions specify the intended aspect ratio. Images are fitted
inside the document/slide area. Workbook images additionally specify `cell` (A1 address), with
size in pixels and a one-cell DrawingML anchor. Images cannot name paths, URLs or arbitrary data URIs.
Presentations have up to 100 slides and workbooks up to 50 images per sheet.

Example:

```json
{
  "filename": "Report.docx",
  "spec": {
    "version": 1,
    "title": "Report",
    "blocks": [
      { "type": "paragraph", "style": "heading1", "text": "Summary" },
      { "type": "paragraph", "text": "The report content." }
    ]
  }
}
```

Exact array, text, sheet-name and dimension limits live in `officeSpec.ts`. Whole inputs are limited
to 128 KiB of UTF-8 JSON. Two Office operations may hold image, compute and publication resources
at once; cancellation does not release a running native lease or its temporary files before
cleanup. Code Mode uses its existing separate bridge pool, so a script waiting for an Office child
tool does not occupy the child's compute slot.

## Files, Images And Memory

Source documents and images stay on disk until the job reads them: `__files.read(index)` returns
an input as an ArrayBuffer inside the job's heap, and `saveOffice` writes the finished package with
`__files.write`, returning only its size. No document or image bytes pass through Hermes, base64 or
the job's source text, and every input is read at most once per job. The prelude keeps `__files` in
a closure, so a model script reaches files only through `readInput` and the validating `saveOffice`.
Clients whose sandbox predates
`runFiles` omit the Office tools.

A call may use 50 distinct images (create, replace or script inputs), from attachments, generated
images or workspace files in any still format. PNG/JPEG files up to 1 MiB are embedded unchanged;
larger or other images get a temporary JPEG copy of at most 2048 px and about 1 MiB, so callers
never shrink or regenerate an image to fit. Prepared images may total 64 MiB per call.

Sources and outputs are limited to 64 MiB, script inputs to 96 MiB together. A job gets 120 seconds
and a heap of 128 MiB plus four times the bytes it reads, at most 512 MiB; package transforms,
which run only app code, always get 512 MiB for XML trees. Measured on a Mac with the
app's native engine: inspecting a 60 MiB deck needs 128 MiB; adding 50 images (30 MiB) to a 30 MiB
deck needs 160 MiB and 2 seconds; creating a 50-image document, workbook or deck needs 68-76 MiB and
about 1 second. Phones are slower; the deadline leaves room for that.

Byte/string conversions use indexed loops. QuickJS materializes `Uint8Array.from(string, fn)` as an
array of one-character strings first, about 70 bytes of heap per input byte, which made every file
above about 0.9 MiB fail in 64 MiB. ZIP packing stores already-compressed media (JPEG, PNG, GIF,
WebP, audio and video) and deflates the rest. docx's Packer is patched the same way, and its
pure-JavaScript SHA-1 image naming is replaced by object identity; PptxGenJS generation embeds a
1-pixel stand-in that the real bytes replace after packing, avoiding its JavaScript base64 decoder.

All nine tools are absent without the native compute sandbox. They do not require its interactive
bridge. Each tool declares `RuntimeTool.deferred`; Pi exposes its schema through `tool_search`,
and its normal callable catalog also makes the tools available as Code Mode child tools.
They retain the existing `replay: 'unsafe'` policy. A
recorded child artifact survives parent interruption through the existing durable receipt. The
managed-file commit and Pi receipt are not one transaction: a crash in that gap may leave an orphan;
this implementation neither retries that unsafe write automatically nor claims exactly-once output.

Storage uses `createFileEntry` with generated provenance, returning only managed metadata and
artifacts. Cancellation before publication produces no successful artifact; storage owns rollback
if its write or entry transaction fails. Successful outputs receive the catalog's usual turn grant.
Source and image reads use `WorkspaceFileAccess.resolveRead`: conversation grants or live membership
in the selected workspace are required on every call. Outputs are separate logical files in the
selected workspace, or at the library root when no workspace is selected. Storage receives the
workspace placement for validation at commit; edits do not advance the source file's version.

## Office Scripts

`run_office_script` opens the pinned libraries to the model instead of wrapping more of them in
specs. The output extension selects one generator library (`docx`, `PptxGenJS` or `XLSX`); `zip`
(fflate), `xml` (xmldom), `atob`/`btoa` and `inputs[id]` (`name`, `mediaType`, `base64`, `bytes`)
are always present; `bytes` and `base64` are read on first use. The script is the body of an async
function and returns the file as `Uint8Array`, `ArrayBuffer` or base64. A script that returns
nothing only inspects its inputs: it reports `status: "read"` with its console output (16 KiB) and
saves no file.

The job rejects a result that is not a ZIP package containing the format's main part, or whose XML
parts (each up to 1 MiB) do not parse, so hand-edited package XML cannot publish a corrupt file.
The adapter then publishes the result like generation. Inputs are up to 50 authorized managed
files; image inputs arrive as prepared copies. Script and console errors return as a failed call
with `status: "error"` so the model can correct and retry; a memory failure says that rewriting the
same work cannot fix it. Formula cells must carry their computed value because nothing in the app
calculates them.

The QuickJS job has no app, file or network port, so model code can only compute bytes. Changing an
existing file without losing untouched parts goes through its package XML or `docx.patchDocument`;
SheetJS read/write drops styles, images and charts, and PptxGenJS cannot open files. The fixed spec
tools stay the cheaper path for work they cover.

## Desktop Reference And Patch Contract

The reference is Cherry Desktop's bundled
[office-transform skill](https://github.com/CherryHQ/cherry-studio/blob/f0acf13588/resources/skills/office-transform/SKILL.md),
its `office_patch_copy.py` and `office/` helpers, and its DOCX/PPTX run-edit recipes. Mobile ports
those algorithms using the existing ZIP/XML libraries; it does not execute Desktop's Python or
`uv` commands. Desktop's unrestricted library scripting is broader than these bounded tools.

`officeTransformCode.ts` copies the package's unmodified decompressed part contents unchanged,
mutating only selected XML parts. ZIP compression, timestamps and entry metadata are not preserved
byte-for-byte. Every operation runs against one source byte snapshot. A later invalid edit rejects
the entire batch before publication; earlier in-memory mutations never escape the compute job.

- DOCX addresses body-level paragraphs (tables excluded), with optional `w14:paraId` checked against
  the ordinal. Optional `charRange` uses UTF-16 offsets: reads return the full paragraph and a selected
  slice; edits restrict matching to that slice. PPTX addresses one-based slide order through relationships, an OOXML shape id
  (including grouped shapes), zero-based paragraph, and optional table-cell coordinates.
- Text replacement requires the full exact paragraph text plus one unique `find` occurrence in the selected range (or the whole paragraph). It
  changes text nodes, retaining surrounding runs and hyperlinks; replacement text inherits the
  first intersected run's formatting. Fields, drawings, bookmarks, comments, tracked changes,
  unknown inline elements and page/column breaks in the target paragraph are refused. Replacements
  cannot introduce tabs or line breaks. Multiple edits to one paragraph use sequential preconditions.
- XLSX writes numbers, booleans, literal text or clears with null. Cell style attributes survive.
  Ordinary formulas may be explicitly replaced; grouped/shared/array/data-table formulas, merged
  follower cells, cells carrying rich-value/dynamic-array metadata and protected sheets are refused. Cell writes request full recalculation; image-only edits do not change cells or calculation settings. Replacing
  a formula removes its calculation-chain package bookkeeping. No formula evaluator runs, so
  cached dependent values and preview values may remain stale until a spreadsheet app recalculates.
- Sources and outputs are limited to 64 MiB. Archives admit at most 4096 entries and 128 MiB of
  expanded data. An XML part parsed for inspection or editing is limited to 2 MiB: xmldom takes
  about 180 bytes of heap per byte, so these app-only jobs get the full 512 MiB heap. Duplicate/unsafe paths, DTDs, unsupported relationships, Strict OOXML,
  signed/macro packages and protected Word edits fail explicitly. External relationship targets
  are never fetched. The parser accepts UTF-8 and BOM-marked UTF-16 XML.
- Inspect pages have `total` and `offset`; PPTX shape pages also have `shape_total`/`shape_offset`.
  Excerpts are shortened intentionally. Exact reads are not silently truncated: responses above
  128 KiB fail and require a smaller range. Inspecting a file is not a guarantee every target can
  be edited; target-specific checks run before writing.

Inspection/read return `source_sha256`. Every edit checks that digest against its source snapshot,
creates a new managed file with generated provenance, and emits a `derived` artifact. Successful
edit receipts include source id/hash and output hash; there is no new lineage database.

### Existing Picture Replacement

Inspect with `kind: "images"` before supplying the edit tool's optional `images` array. Each entry
contains the returned `anchor` and a replacement managed `file_entry_id`. Image-only and mixed
text/cell-plus-image edits are supported, with at most 50 replacement images per call, prepared
like generation images. Workbook image anchors must match the top-level `sheet`. At least one text/cell
edit or image replacement is required. Every source and replacement passes file authorization
before any source or image bytes are read; the source digest is checked before image resolution.

Inspection pages across pictures, returning `kind: "images"`, `total`, `offset` and `items`. Items
include `anchor`, `name`, `alt`, `replaceable`, an optional unsupported `reason`, and media type,
local frame dimensions in pixels and worksheet anchor cell when available. Names and alt text are
bounded to 300 characters. `replaceable` describes the picture representation, not proof that a
protected, signed or macro-containing package can be edited. These anchors are for `images`, not
`read_office_content` or the preview's text selection references.

- DOCX indexes DrawingML pictures in the main body, including tables, with zero-based
  `image_index`. Headers, footers, legacy VML, content controls and tracked-change pictures are
  outside the supported replacement surface.
- XLSX indexes DrawingML pictures within each `sheet`, with zero-based `image_index`. Existing
  one-cell, two-cell and absolute anchors retain their geometry. Protected worksheets and drawing
  parts shared by multiple worksheet references are refused.
- PPTX uses one-based `slide` and the picture's `nodeId`, including ordinary grouped pictures.
  Masters, layouts and backgrounds are not inspected. Ambiguous shape ids and slide parts shared
  by multiple slide references are refused.

Replacement supports existing embedded PNG/JPEG pictures. Linked images, alternate content,
tiled fills and picture BLIP effects/extensions (including SVG alternatives) are refused rather
than leaving competing image sources. The existing frame, crop, rotation, grouping and alt text
remain unchanged: this operation does not automatically fit a different aspect ratio, so prepare
the replacement accordingly. Inserting/deleting pictures and changing layout go through
`run_office_script`, not a fixed operation.

Only the chosen picture reference is redirected to newly added media and a fresh relationship.
Other occurrences sharing the original image are unchanged. The old media/relationships are
retained, and repeated replacement can grow the package up to the existing limits. Any invalid
replacement rejects the entire batch; the tool publishes no partial result.

The file viewer's selection mode uses the already-shared `@cherrystudio/file-preview`.
**Reference in new chat** opens an editable standard-Agent draft with the original attachment and a
selection chip; it does not send. Runtime input turns the chip into a `selection-ref` block with its
managed file id, structural anchor and excerpt.
Following Desktop's workflow, the Agent reads the current referenced content and compares it with
the excerpt before editing. Selection references do not impose an additional backend digest check
or grant file access. AnyDoc remains the reader; its intermediate representation is never the
source for rewriting an imported package.

## Pinned Libraries

`vendor/*.json` retains library identity, published source locations, source SHA-256 values and
upstream license text. The three generation assets also record npm archive integrity, which was
checked when extracting them. The ZIP/XML assets were copied from the already-installed
locked versions with per-file SHA-256 and license text; their npm archive integrity was not separately
rechecked during this change. No install scripts or Node module resolution are used by computations.

| Library | Version | Published asset |
| --- | --- | --- |
| docx | 9.11.0 | `dist/index.umd.cjs` |
| PptxGenJS | 4.0.1 | `dist/pptxgen.bundle.js` (includes JSZip) |
| SheetJS (`@e965/xlsx`, matching the app dependency) | 0.20.3 | `dist/xlsx.mini.min.js` |
| fflate | 0.8.3 | `umd/index.js` |
| @xmldom/xmldom | 0.9.12 | Published `lib/*.js`, loaded by a closed app-owned module map |

The private job supplies zero-delay scheduling through QuickJS microtasks for JSZip and a UTF-8
encoder for generation and package patching. The encoder preserves supplementary Unicode characters
when the pinned libraries run without native `TextEncoder`. It does not add globals or capabilities
to the model's VM. Generation layout is
app-owned, but ZIP timestamps and library-generated identifiers are not byte-deterministic.

## Remaining Acceptance

This is a bounded mobile implementation, not feature parity with unrestricted Desktop Python
scripting or a full Office editor.

Focused tests pass for serialized inputs, generated package content, scalar types, Unicode,
image embedding, workspace authorization and placement, cancellation, storage rollback, discovery,
selection references and child-artifact retention. The JavaScript adapter fixture uses a minimal
Node VM; it is not evidence of QuickJS compatibility, native budgets, Office visual fidelity, or
device behavior. Before release, complete both-platform native acceptance, open
the files in Office without a repair prompt, and check preview, text wrapping and editability.

The fixed tools do not cover template filling, arbitrary layouts, formula authoring, chart
authoring, editing Word table text/headers or inserting/deleting images in existing files; those go
through `run_office_script`. Formula evaluation and macros remain outside this module. Untouched
images, charts, themes and other parts are preserved rather than reconstructed. The preview HTML
must be regenerated by an authorized package build before device acceptance of the selection UI. See
[Office Tools Design](../../../../docs/references/agent/office-tools-design.md).

# Office Files

This module generates, inspects, reads and patches Office files in the native QuickJS compute pool.
The Agent adapters in `ai/agent/tools/officeTools.ts` and `officeEditTools.ts` own file authorization,
source hashes, image resolution and managed-file publication. Computations receive validated data
and bytes; they have no file or network port. The existing preview WebView supplies selections.
There is no new native module, remote service, job queue or model-written renderer.

## Implemented Surface

| Tool | Supported input | Output |
| --- | --- | --- |
| `create_document` | Paragraphs (`normal`, `title`, `heading1`, `heading2`), ordered/unordered lists, rectangular tables, PNG/JPEG images | DOCX |
| `create_workbook` | Unique named sheets, rectangular rows of string/number/boolean/null cells, column widths, numeric formats and PNG/JPEG images anchored to cells | XLSX |
| `create_presentation` | Widescreen title, bullet, table and image slides; light/dark theme | PPTX with editable supported elements |
| `inspect_office_file` | Managed source, item offset/limit and optional PPTX shape offset | Sheet names, body paragraph anchors, or slides/shapes; source SHA-256 |
| `read_office_content` | Managed source and one structural anchor | Exact paragraph text or up to 1000 cells with saved formula values; source SHA-256 |
| `edit_document` | Version 1, source/hash, filename, exact paragraph precondition and unique literal replacement | New DOCX copy, retaining surrounding runs and hyperlinks |
| `edit_workbook` | Version 1, source/hash, filename, one sheet and up to 1000 scalar cell edits | New XLSX copy, retaining untouched package parts |
| `edit_presentation` | Version 1, source/hash, filename, slide/shape/table-cell paragraph replacements | New PPTX copy, retaining surrounding runs and hyperlinks |

Creation inputs have `filename` and `spec`, and every creation spec requires `version: 1`.
Edit inputs require top-level `version: 1`. Unknown properties and
invalid XML text are rejected. Workbook strings are literal, including strings beginning with `=`;
there is no formula authoring or calculation. Images require an authorized managed `file_entry_id`,
`width_px` and `height_px`; these dimensions specify the intended aspect ratio. Images are fitted
inside the document/slide area. Workbook images additionally specify `cell` (A1 address), with
size in pixels and a one-cell DrawingML anchor. Images cannot name paths, URLs or arbitrary data URIs.

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
to 128 KiB of UTF-8 JSON, images to 8 distinct references and 2 MiB in total, and generated files to
4 MiB. Each native computation gets 30 seconds and 64 MiB. Two Office operations may hold image,
compute and publication resources at once; cancellation does not release a running native lease
before cleanup. Code Mode uses its existing separate bridge pool, so a script waiting for an Office
child tool does not occupy the child's compute slot.

All eight tools are absent without the native compute sandbox. They do not require its interactive
bridge. Pi exposes their schemas through `tool_search`, and its normal callable catalog also makes
them available as Code Mode child tools. They retain the existing `replay: 'unsafe'` policy. A
recorded child artifact survives parent interruption through the existing durable receipt. The
managed-file commit and Pi receipt are not one transaction: a crash in that gap may leave an orphan;
this implementation neither retries that unsafe write automatically nor claims exactly-once output.

Storage uses `createBytesEntry` with generated provenance, returning only managed metadata and
artifacts. Cancellation before publication produces no successful artifact; storage owns rollback
if its write or entry transaction fails. Successful outputs receive the catalog's usual turn grant.
Source and image reads use `WorkspaceFileAccess.resolveRead`: conversation grants or live membership
in the selected workspace are required on every call. Outputs are separate logical files in the
selected workspace, or at the library root when no workspace is selected. Storage receives the
workspace placement for validation at commit; edits do not advance the source file's version.

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
  follower cells, cells carrying rich-value/dynamic-array metadata and protected sheets are refused. Writes request full recalculation. Replacing
  a formula removes its calculation-chain package bookkeeping. No formula evaluator runs, so
  cached dependent values and preview values may remain stale until a spreadsheet app recalculates.
- Sources and outputs are limited to 4 MiB. Archives admit at most 2048 entries, 16 MiB expanded
  data and 4 MiB per part. Duplicate/unsafe paths, DTDs, unsupported relationships, Strict OOXML,
  signed/macro packages and protected Word edits fail explicitly. External relationship targets
  are never fetched. The parser accepts UTF-8 and BOM-marked UTF-16 XML.
- Inspect pages have `total` and `offset`; PPTX shape pages also have `shape_total`/`shape_offset`.
  Excerpts are shortened intentionally. Exact reads are not silently truncated: responses above
  128 KiB fail and require a smaller range. Inspecting a file is not a guarantee every target can
  be edited; target-specific checks run before writing.

Inspection/read return `source_sha256`. Every edit checks that digest against its source snapshot,
creates a new managed file with generated provenance, and emits a `derived` artifact. Successful
edit receipts include source id/hash and output hash; there is no new lineage database.

The file viewer's selection mode uses the already-shared `@cherrystudio/file-preview`.
**Reference in new chat** opens an editable standard-Agent draft with the original attachment and a
`selection-ref` block containing its managed file id, structural anchor and excerpt; it does not send.
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

Template filling, arbitrary layouts, formula authoring/evaluation, chart authoring, editing Word
tables/headers, changing images in existing files, and macros remain outside this slice. Untouched
images, charts, themes and other parts are preserved rather than reconstructed. The preview HTML
must be regenerated by an authorized package build before device acceptance of the selection UI. See
[Office Tools Design](../../../../docs/references/agent/office-tools-design.md).

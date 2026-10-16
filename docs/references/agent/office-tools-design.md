# Office Tools Design

> Status: design. None of the Office tools below are implemented or registered. This document
> defines the proposed scope, runtime integration, and delivery sequence. Current behavior remains
> documented in
> [Agent Tools And Controlled Resources](./agent-tools-and-resources.md).

## Goal And Starting Point

An Agent should be able to create a Word document, Excel workbook, or editable PowerPoint
presentation, inspect an imported file, and make bounded changes while retaining the original.
Every result belongs to Cherry's existing file library and can be opened, attached, or shared
through its existing surfaces.

The original contract was introduced in
[#633](https://github.com/CherryHQ/cherry-studio-app/pull/633). Its unimplemented Office section was
removed when [#692](https://github.com/CherryHQ/cherry-studio-app/pull/692) consolidated references
around shipped behavior. This design restores that scope separately and accounts for the current
file tools and runtime boundaries.

| Existing capability | Reuse and boundary |
| --- | --- |
| Managed files and tool artifacts | Reuse `file_entry`, generated provenance, validated artifact admission, and transcript file parts; no separate Office blob store |
| `read_file` and document attachments | Already expose bounded Office text or AnyDoc's intermediate document representation; neither output is a reversible editing contract |
| `write_file` and `edit_file` | Handle UTF-8 text; their schemas and draft rewrite behavior do not become binary Office editing APIs |
| In-app document preview | Already opens DOCX, XLSX, and PPTX; viewing a file does not prove that an edit preserves its contents |
| HTML conversion | Already produces image-based PPTX; editable slide text and shapes require a separate generation capability |
| Built-in tool catalog | Reuse stable tool identities, per-turn availability, approvals, cancellation, and `{ value, artifacts }` results |
| Native QuickJS and Pi Code Mode | Already run scripts that compute and invoke authorized tools through durable nested calls; reuse this execution path for Office workflows |

See [File Model](../data/file-model.md), [File Preview And Viewer](../file-preview-and-viewer.md),
and [HTML Conversion](../html-conversion.md) for these current capabilities.

## Proposed Tool Surface

| Tool | Input intent | Result |
| --- | --- | --- |
| `create_document` | Filename and `DocumentSpecV1` | Managed `.docx` |
| `create_workbook` | Filename and `WorkbookSpecV1` | Managed `.xlsx` |
| `create_presentation` | Filename and `PresentationSpecV1` | Managed `.pptx` with editable supported elements |
| `inspect_office_file` | Managed source id | Format, bounded outline, compatibility findings, available operations, and revision-bound selectors |
| `read_office_content` | Managed source id and a bounded section, sheet/range, slide, or selector query | Structured content window and continuation information |
| `edit_document` | Managed source id and `DocumentEditOperationV1[]` | New derived `.docx` |
| `edit_workbook` | Managed source id and `WorkbookEditOperationV1[]` | New derived `.xlsx` |
| `edit_presentation` | Managed source id and `PresentationEditOperationV1[]` | New derived `.pptx` |

These are proposed logical names, not executable tools. Register each only when its format adapter
and acceptance evidence exist. Generic inspection and reading may support fewer formats at first;
their descriptions and returned capability matrix must identify the implemented subset.
`read_file` remains the general reading tool. `read_office_content` exists for structural addresses
needed by edits, not as a second plain-text extraction path.

## First Supported Content

Start with a deliberately bounded surface. Each format's implementation must publish its precise
operation matrix before enabling mutations on that format.

| Format | Initial generation target | Initial edit target | Deferred |
| --- | --- | --- | --- |
| DOCX | Headings, paragraphs, lists, simple tables, managed images, and named style presets | Replace text in an inspected simple paragraph or table cell while preserving its supported style | Arbitrary page layout, tracked-change editing, fields, embedded objects, and complex mixed-format text |
| XLSX | Named sheets, explicitly typed scalar cells, simple number formats, and column widths | Write or clear a bounded range of ordinary cells without changing sheet structure | Formula authoring/evaluation, row or column insertion, merges, charts, pivot tables, and external-data refresh |
| PPTX | Fixed layouts with editable title/body text, simple tables, and managed images | Replace text in an inspected supported text shape | Arbitrary shape/layout editing, animations, embedded media, charts, and master/theme editing |

Deferred features in imported files are not automatically discarded or grounds to reject the whole
file. Inspection distinguishes an unsupported target from an untouched feature the patcher can
preserve. Reject an operation when its effects cannot be bounded or preserved reliably.

For XLSX, distinguish literal strings, numbers, booleans, and empty cells explicitly. A string
beginning with `=` remains a string. Protect formula cells from initial range edits and preserve
untouched formulas. If changing input cells invalidates calculated values, the implementation must
handle stale caches and request recalculation on opening; it must not report old cached values as
newly calculated results. This is a prerequisite for enabling workbook edits.

Initial writable formats are non-encrypted, non-macro `.docx`, `.xlsx`, and `.pptx`. Legacy binary
Office files, macro-enabled or signed files, password-protected files, arbitrary format conversion,
and a full visual Office editor remain outside this scope. Existing read-only support for other
formats is unchanged. Pixel-identical rendering across Office applications is not promised.

## Contracts And Ownership

The model's tool call supplies the structured content directly. Cherry validates it and generates
or patches bytes locally; there is no hidden second model call to translate prose into another
payload, no shell, and no downloaded executable script.

- Keep `DocumentSpecV1`, `WorkbookSpecV1`, `PresentationSpecV1`, and their edit-operation schemas
  separate. Use one strict Zod schema per contract to validate inputs and export the runtime JSON
  Schema. An explicit version identifies the contract; unknown fields and operations are rejected.
- Specs describe semantic content and supported style/layout presets. They do not expose library
  classes, raw Office Open XML, ZIP paths, device paths, base64 binaries, or executable code.
- Inputs use the existing `file_entry_id` tool convention for managed sources; outputs retain
  `fileEntryId`. Every referenced image or template must independently pass the same file scope
  and availability checks as the source.
- Place format work behind a proposed `src/backend/services/office` public surface. Keep schemas
  and adapters there while their consumers are backend-only. Promote only contracts actually
  needed by another layer, following [Code Organization](../code-organization.md).
- Tool adapters belong under `src/backend/ai/agent/tools` and receive narrow injected file and
  Office capabilities. The Host owns authorization and artifact admission. Pi owns conversation
  execution, never Office libraries, managed storage, or a second model loop.
- Preview remains owned by the existing file viewer. The Office service produces files and
  structural metadata; it does not introduce a second viewer or file browser.

Generation and editing may use different underlying libraries. Library-specific inputs remain
private adapter details, so replacing a renderer does not change persisted tool contracts.

## QuickJS Execution Strategy

QuickJS is already a usable execution environment here. The app uses native QuickJS-NG, with
`@earendil-works/pi-codemode`'s prelude and Pi Durable's Code Mode extension. `run_js` remains the
application capability and audit identity; upstream `codemode` is the model-facing executor.
See [JavaScript Sandbox](./agent-tools-and-resources.md#javascript-sandbox) and the
[native module](../../../modules/js-sandbox/README.md).

Use two distinct roles for this existing environment:

| Role | Proposed use | Boundary |
| --- | --- | --- |
| Model-written Code Mode script | Transform bounded source data, calculate values, construct a document spec or edit batch, and call Office tools | Existing script VM and durable nested-tool protocol; all effects pass through authorized tools |
| Application-owned Office computation | Evaluate bundling a pure-JavaScript renderer or patch algorithm into a bounded native computation | Private implementation of the Office service; trusted, pinned library code, explicit input/output and cancellation budgets |

The first role is the integration baseline. For example, a script can read a sheet range, compute
totals in JavaScript, and submit one range edit, or build slides from data and invoke
`create_presentation`. Return only a concise summary to the model; intermediate structured tool
results need not become separate model-history messages. Use batch operations within a tool rather
than one tool call per cell. A later failed call does not roll back earlier successful tools; the
atomicity guarantee applies to one edit batch, not an entire script.

The second role is a feasibility decision, not an existing Office engine. Compare a bundled
QuickJS computation with an application-side library adapter using representative files. Reuse
`createJsSandbox`'s separate compute pool if QuickJS is selected: the current service allows two
bridge scripts and two bounded computations in separate pools, so a script waiting on an Office
tool cannot occupy the only slot needed by that tool's computation. Do not launch another Code
Mode script recursively or bypass its durable calls with a side-effecting script global.

The current Code Mode VM has a 64 MiB heap, bounded native stack, a deterministic compute budget,
virtual time, and a seeded random source. Calls cross a JSON bridge. It has no Node `require`,
module loader, filesystem, network, DOM, or WebAssembly access. A library installed in the app is
therefore not automatically usable inside that VM. A candidate renderer needs a bundled compatible
entry and explicit handling of its runtime assumptions; introducing browser or Node shims is a
selection cost, not an assumed capability.

Keep Office ZIPs, images, and generated binary output out of the model-written script and its replay
journal. Scripts exchange bounded semantic JSON and managed file ids. Private rendering may need
binary transport, but the current compute interface returns JSON text: establish its transfer and
copy budget before choosing it for large packages. Do not imply that a streaming binary bridge
already exists, or increase the general script heap to fit an unbounded document. Expensive
rendering belongs inside a bounded tool operation, with its own cancellation and cleanup.

## Pi Durable Integration

Use the existing Pi Durable 1.2 integration and its public extension/task APIs. The
[migration reference](./pi-durable-migration.md) owns persistence and recovery behavior; Office does
not introduce another harness, conversation engine, tool dispatcher, or long-term document store.

```text
Model direct call OR Code Mode script in native QuickJS
    -> Pi ToolTask (nested when called by a script)
    -> Cherry tool resolution, approval, budget, and file grants
    -> Office service (format adapter; optional bounded QuickJS computation)
    -> managed file import and verified artifact admission
    -> Pi result/child artifact receipt -> Cherry transcript file part
```

### Registration, Discovery, And Results

- Add implemented Office capabilities to the existing built-in catalog and tool source, with
  stable `ToolRef` identities. Adapt them through `createPiDurableToolExtension`, which already
  supplies `defineTool`, `ToolTask` hooks, and result projection. Keep Pi imports inside the runtime
  adapter rather than adding them to the Office service.
- Propose deferred exposure for these larger, occasional schemas. Extend the adapter's current
  deferred classification, which now covers MCP and selected Skill tools. The model discovers
  Office tools through upstream `tool_search`; scripts use `searchTools`, `describeTool`, and
  `describeNamespace`. Keep both direct-model and nested-tool callers allowed. Discovery affects
  prompt loading, not the tool's authorization or availability.
- Reuse the current 600-token Code Mode declaration budget rather than placing every Office schema
  in the initial prompt. A client without the native script bridge can still call an available
  Office tool directly; if a selected renderer itself needs native QuickJS, gate that format on
  the renderer's actual requirements separately.
- Every nested call must run through the same resolution, approval, cancellation, failure handling,
  and artifact checks as a direct call. Parent and child calls share the existing 64-call budget.
  Batching reduces calls but does not remove input, operation-count, or output limits.
- Return the same bounded `{ value, artifacts }` through direct and scripted calls. The current
  adapter maps this to Pi's program-facing `structuredOutput`, model output, and UI details.
  Scripts inspect `value.status` for application-level rejections; do not assume every invalid
  input throws. Never place binary Office content in any of these result channels.
- Reuse Host artifact admission and the existing `PiCodemodeFiles` /
  `PiCodemodeArtifactsEntry` retention path. Once its receipt is committed, a successful child
  artifact must remain visible even if its parent script later fails or is cancelled. A script
  does not need to print an id to make that artifact part of the conversation.

### Recovery And Long-Term Ownership

The current adapter declares application tools `replay: 'unsafe'`, including reads. Preserve that
default for the first Office implementation. Code Mode's replayable parent does not make a child
file mutation safe to repeat. Upstream replays deterministic script computation and reattaches
stable child-call keys to recorded results; it does not make a managed-file commit atomic with a
Pi task result.

| Interruption point | Required Office behavior |
| --- | --- |
| Before execution intent | Re-resolve the current tool, file scope, and approval before execution |
| During an Office call after intent | Keep the existing interrupted outcome; do not automatically regenerate or reapply edits |
| After a completed child result is recorded | Resume the parent using that recorded child result and managed artifact, without repeating the write |
| After file import but before its Pi result/artifact receipt | Treat the outcome as uncertain; an unreferenced file may remain. Do not claim failure means no file exists or retry using only a filename |
| After history rebuild, fork, or backup restore | Reconstruct durable references from Cherry transcript/files; do not depend on a previous VM, selector cache, or Code Mode `store/load` |

Use the existing `turnId` and `toolCallId` when designing any publication receipt, not model-supplied
keys or display filenames. An optional future idempotent publication boundary must reconcile a
committed file and its receipt before any tool is marked replay-safe; adding a receipt alone does
not close the crash window. The first slice must state its recovery policy and orphan-file
handling explicitly without changing the replay behavior of unrelated tools.

`store/load` may cache working data, but Office specifications that must survive a new working copy
belong in managed files. `cherry.db` owns complete transcript/file references and managed storage
owns output bytes; `pi-agent.db` owns active execution working data. Do not write upstream SQL
tables or serialize Office library objects as persistent Pi documents. A code/prelude/engine
fingerprint mismatch may stop unfinished script replay; it must not trigger a fallback that
silently starts the Office writes again.

## Inspection And Safe Editing

1. Resolve an active source through the current turn's controlled file scope. Detect its actual
   format and reject unsupported packages before building an editable representation.
2. Inspect bounded structure and return compatibility findings with format-specific selectors.
   A selector identifies a paragraph, cell/range, or slide shape in that exact source revision;
   it is not a path or an access grant. A plain text offset from `read_file` is not a selector.
3. Read additional content through bounded structural windows. Return explicit truncation and
   continuation information; large documents must not enter model context in one response.
4. Validate the entire ordered edit batch, its selectors, and operation limits against the same
   revision. Invalid, ambiguous, stale, or unsupported targets reject the whole batch.
5. Patch a temporary copy, preserve untouched package parts and relationships, and validate the
   completed output before importing it. Never reconstruct an imported file solely from a reader's
   supported subset. Preservation means unchanged logical part contents and relationships, not
   byte-identical ZIP compression or entry order.
6. Commit one new managed entry and return it as a `derived` artifact with its source id and a
   bounded change summary. A failed batch publishes no partial file. Further edits explicitly
   target the returned entry and obtain selectors for that revision.

Office V1 keeps source files immutable even when they were generated in the current turn. Batch
operations reduce intermediate artifacts. It deliberately does not adopt `edit_file`'s in-place
text-draft rewriting or automatic redirection from an old id to the current draft: document readers
currently cache by immutable file id, and selectors must keep identifying the bytes inspected.
Concurrent edits of the same source create independent derived files, never an implicit merged
version. A sequential edit must name the preceding result.

Do not add a permanent selector table or a file-lineage migration for the first slice. Define a
versioned selector representation scoped to immutable file ids and revalidate it on every call.
If inspection uses an in-memory cache, losing it must require only reinspection, not invalidate
the managed file or silently retarget a selector.

Template filling follows this same path after inspection and editing are available. Initially,
only explicitly supported placeholders or inspected targets may be filled. Templates are managed
files, preserved as sources, and results are derived entries. Placeholder syntax and how a caller
requests filling remain a later contract decision; no executable template language is implied.

## Tool Policy, Files, And Failure Behavior

- Proposed admission: keep local Office tools with the core file tools, subject to model tool
  support and the implemented platform/format matrix, with deferred schema loading as above.
  Start reads and local copy-producing writes with `auto`, matching text-file creation; this grants
  neither external publishing nor provider quota. Any later cloud processing or export tool needs
  its own policy.
- All Office source, template, and asset reads require a turn file grant. Do not inherit
  `edit_file`'s separate policy that knowing an active file id permits editing outside that scope.
  Recheck availability and authorization at execution, not just during inspection.
- Generation returns `created`; edits and template filling return `derived`. Import validated bytes
  through the existing managed-file boundary with generated provenance. The tool result carries
  the file id, readable name, format, size, bounded warnings, and a source id where applicable.
  The Host admits artifacts and persists their transcript references through its existing path.
- Retain originals and use the existing readable version-name convention for derived entries.
  Export and sharing remain explicit user actions through the existing file surface.
- Bound compressed input, actual expanded ZIP bytes, individual XML parts, entry count, nesting,
  operation count, content windows, images, output size, and execution time. Existing extraction
  limits are evidence for a starting budget, not proof that generation/editing is safe at that size.
  Set and document numeric limits per adapter before exposing it.
- Reject malformed packages, duplicate/ambiguous parts, unsafe relationship targets, and unsupported
  active content. Never fetch an external relationship or execute a formula, macro, or embedded
  script during inspection or mutation. Preserve inert external references only where the format's
  operation matrix establishes that they remain untouched.
- Honor cancellation before expensive work and before file publication. Dispose temporary files
  and buffers on failure or cancellation, and bound any synchronous work that cannot be interrupted.
  Partial files must not become successful artifacts.
- Use actionable structured errors for invalid input, unsupported operations, unavailable files,
  stale selectors, exceeded limits, and preservation failures. Do not silently fall back to
  flattening a document or rebuilding an imported package with lost features.
- Apply the Pi Durable recovery rules above. Local generation does not add a guarantee of
  exactly-once file publication or execution while the mobile OS suspends the application.

## Delivery Sequence

Track executable work in issues when implementation starts; each slice updates its current-state
documentation only when it lands.

| Slice | Deliverable | Exit evidence before exposure |
| --- | --- | --- |
| 1. Feasibility and contracts | Confirm per-format engines, schemas, limits, QuickJS execution placement, Pi discovery/results, and file-publication recovery; establish representative fixtures | Renderer placement fits mobile and JSON-transfer budgets; direct and scripted call paths and recovery outcomes are specified; dependencies and licenses reviewed |
| 2. Basic generation | Enable DOCX and XLSX creation separately, then PPTX with editable supported elements; reuse artifact storage and preview | Each enabled format produces valid files through direct and Code Mode calls, opens in Office, displays in the app, and retains editable content; cancellation and failed publication leave no successful partial artifact |
| 3. Structural inspection | Add inspection and paged structural reads, format by format, with revision-bound selectors and operation findings | Selector stability, bounded paging, compatibility reporting, and rejection of stale or cross-file selectors demonstrated |
| 4. Bounded editing | Start with ordinary XLSX ranges, then simple DOCX text and PPTX text shapes; each format depends on its inspector and preservation evidence | Whole-batch behavior, source immutability, untouched-part preservation, formula-cache handling where relevant, and derived-artifact admission demonstrated |
| 5. Template filling | Define placeholders/target mapping and reuse the proven inspection/edit path | Filling retains unrelated template content, reports missing or unsupported targets, and preserves the original template |

Generation does not wait for a general patcher. Editing does wait for a reliable inspector and
format-specific preservation evidence. If a format fails a gate, retain the supported formats and
keep the failing tools or operations unavailable rather than lowering the contract.

## Selection Questions And Acceptance Plan

Engine selection remains open. The repository already has `@e965/xlsx`, `fflate`, and
`@xmldom/xmldom` in its Office text path, plus a narrow image-only PPTX writer in document export.
Evaluate those owners before adding dependencies, but do not treat their current extraction or
export use as evidence of preservation-safe edits. AnyDoc's reader output and the preview renderer
also do not establish round-trip fidelity. No new library is selected yet.

The first implementation slice must settle:

- Which local generation and patch engines support each proposed operation on both iOS and
  Android, including bundled QuickJS versus application-side execution, cancellation, memory use,
  bundle cost, and licensing. Follow [Dependencies](../../guides/development.md#dependencies) for
  any dependency work.
- Exact style/layout presets, text-run replacement rules, structural selector encoding, numeric
  budgets, formula-cache behavior, and supported external-reference preservation.
- How the existing managed-file commit boundary and durable tool outcomes handle cancellation,
  interruption, and an output committed immediately before a lost result.
- Whether deferred exposure and core-file admission provide a usable direct and scripted experience
  with the real schemas; extend existing discovery metadata only where needed.

Planned validation should protect observable file behavior: generated content and editable objects;
an unchanged source; unchanged unrelated package parts; rejected stale/ambiguous selectors;
all-or-nothing batches; bounded archive processing and paging; and cancellation/recovery without
silent duplicate publication. Include external-authored files containing both supported targets
and unsupported features, rather than only files generated by Cherry itself.

For Pi integration, cover direct and nested calls, discovery without a script bridge, identical
authorization failures, child-call budget exhaustion, and visibility of a committed child artifact
after parent cancellation. Recovery cases must distinguish a recorded child result from an unsafe
in-flight write and the file-import/receipt gap. Exercise cache/store loss and incompatible script
fingerprints without replaying writes. A renderer using the compute pool additionally needs
evidence that scripts waiting on tools cannot starve those computations.

Device and desktop Office acceptance should cover both mobile platforms, the existing app preview,
opening output without a repair prompt, editable text/cells/shapes, and formulas recalculated by the
target application where required. Follow [Testing And CI](../../guides/testing-and-ci.md) and
[Parallel Device Testing](../../guides/parallel-device-testing.md).
No builds, tests, or device acceptance are claimed by this design.

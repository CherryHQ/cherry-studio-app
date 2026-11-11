# AI Content Metadata

Status: **implemented; upstream identity coverage and native acceptance pending**.

The client reads and writes implicit AI-content declarations in file metadata. Existing upstream
AIGC declarations travel with unchanged or mechanically transformed content. The client does not
invent a generation-service identity or upstream production identifier. Metadata completion and
read-back precede publication of a changed file. No database field or separate source-fact record
is added.

The scope is file metadata. Visible AI notices, clipboard changes, additional brand watermarks,
and distribution restrictions are outside this design. Existing text, image pixels, document
layout, copying, and sharing behavior remain intact. The resulting technical evidence describes
this capability and its actual format coverage; it does not establish every store-approval requirement.

## Technical Sources

- [GB 45438—2025](https://openstd.samr.gov.cn/bzgk/std/newGbInfo?hcno=F32EA2A561F1886CD8D606513512D547),
  section 6.1 and normative Annex E, defines the metadata fields and their encoding.
- [TC260-PG-20258A: Text Files](https://www.tc260.org.cn/tc260/sjzn/202508/f0a84ada0c11458e9cb6da56c1cb2426/files/760387fb30e94c058c31b8c2b2230020.pdf)
  describes Office custom properties and Markdown header metadata.
- [TC260-PG-20259A: Image Files](https://www.tc260.org.cn/tc260/sjzn/202508/7227bfecdf344c14abc647fbbcf69edf/files/37774d2b3149456ba7179a81bc07d3d5.pdf)
  describes XMP metadata and its placement in image containers.
- [Measures for Labeling AI-Generated and Synthetic Content](https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm),
  articles 5 and 7, cover file-metadata labels and store verification materials respectively.

The adapters follow the final practice guides. HTML uses a proposed `head` meta property; its
independent extraction compatibility still needs acceptance. SVG remains unimplemented. This design does not add a visible-label
implementation or the agreement and logging workflow for delivery without visible labels.

## Upstream Identity And Validation

Cherry is an aggregation client in this implementation. There is no required global producer
configuration and no automatic assignment of Cherry as either the generation-service provider or
network-content propagator. A selected model, editable Provider nickname, protocol family or
arbitrary relay endpoint does not establish a formal service identity. This technical policy does
not determine the application's regulatory role.

- Preserve the producer, production ID, propagator, propagation ID and declared confidence from an
  existing valid upstream label. Original model-image responses can supply such declarations.
- Missing upstream identity does not block generation or editing and does not create an internal
  source record or fabricated file label. AI text containing an AIGC header is not trusted as
  upstream service metadata.
- A new AI edit clears superseded AIGC declarations from its pending supported-format output;
  historical source bytes remain intact. It cannot keep an old producer's ID for changed content.
- Mechanical transformations preserve inherited declarations. They never turn an unlabeled source
  into a complete label by assigning a local UUID or platform identity.
- Cherry's existing managed entry IDs/revisions and temporary artifact IDs identify local files.
  They are separate from `ProduceID` and `PropagateID` and are not exported as upstream IDs.

Without an upstream label, even an implemented writer does not establish complete GB 45438 Annex E
coverage. Full coverage requires upstream service identity/content information, or a separately confirmed application-service operator role and
identity. Empty or invented provider values and private AI flags are not treated as substitutes.
Existing carrier read/write failures for established declarations remain operation errors.

This capability reads and writes TC260 `AIGC` declarations. C2PA signed Content Credentials and
model-level watermarks such as SynthID are separate provenance mechanisms. Unchanged file copies
retain their bytes, but this client neither validates C2PA signatures nor issues replacement
credentials after content changes. Restoring an AIGC declaration after re-encoding does not establish
that a C2PA credential remains valid or that a content watermark survives. Record those mechanisms
separately in output evidence instead of counting them as AIGC metadata coverage.

Implementation owners are `file/aiContentMetadata.ts`, `file/imageMetadata.ts`,
`shared/utils/aiContentText.ts`, and `office/officeMetadata.ts`. Source declarations are explicit in
Agent and painting producers and selected chat exports. Transformations inspect source-file metadata
before encoding, without backfilling records or rewriting historical blobs. XMP, legacy PNG AIGC text, and EXIF
ImageDescription/UserComment declarations are read before image normalization; canonical image
writes use XMP. Metadata inspection is bounded, and image codec payloads are copied without decoding.

Regression suites cover field validation, source-file inheritance, text carriers/projections, image
containers/EXIF, Office custom properties and native-job lifetime, production/inheritance behavior,
export retries, edit coordinates, and branding failure cleanup. These tests have been written but
have not been executed for this change. Type checking, builds, device acceptance, independent
extraction samples, and store evidence have not been performed. Container fixtures do not establish
native image decoding, Office rendering fidelity, Photos retention, or recipient behavior.

## Producing And Transforming Files

Producing callers explicitly declare AI generation/editing for the current write operation. The
existing `provenance` field keeps its original meaning and is not used to infer AI origin. Source
files are the source of truth for inherited declarations; temporary operation inputs carry only
labels read from their bytes.

| Producing path | Metadata handling |
| --- | --- |
| Agent `write_file` and `edit_file` | Clear superseded declarations on the new output without assigning an unconfirmed producer |
| Office creation, editing, and script outputs | Clear obsolete AIGC properties on new AI outputs; read-only scripts create no file |
| Agent image generation, image tools, and painting jobs | Retain a valid declaration from an original model response; otherwise add no fabricated label |
| Chat exports containing model answers | Clear obsolete or model-authored declarations; do not infer service identity from reply text |
| Labeled Markdown and HTML conversion | Read the source declaration and restore it in the output carrier after rendering |
| Imported files | Read existing labels before normalization or compression and restore them afterward |
| Cropping, rotation, and brand composition | Capture source metadata before encoding and restore it afterward |
| Copies, workspace attachments, upload snapshots, and unchanged delivery | Keep original file bytes; no separate origin record is needed |
| MCP results, desktop resources, downloads, and historical files | Keep existing metadata without guessing origin from filenames or provenance values |

Parsed upstream metadata is a source declaration, not authenticated provenance. A new AI
modification supersedes the previous content declaration and does not allocate an upstream
production ID locally.

## Fields And Identifiers

Use the seven Annex E fields, with string values and one canonical metadata label per file.

| Field | Rule |
| --- | --- |
| `Label` | Retain the upstream declaration: `"1"` (AI-generated), `"2"` (possibly AI-generated), or `"3"` (suspected AI-generated); a producing operation alone does not synthesize a full label |
| `ContentProducer` | The upstream declaration's service-provider name or code; never inferred from a model or editable Provider nickname |
| `ProduceID` | The content identifier assigned by the upstream producer; a local file UUID is separate |
| `ReservedCode1` | Retain the upstream value; this client creates no generation-service signature |
| `ContentPropagator` | Retain the declared propagation-service identity independently of the producer; local saving does not automatically assign Cherry this role |
| `PropagateID` | Retain the upstream propagation identifier independently of the production ID; local copies do not fabricate one |
| `ReservedCode2` | Retain the upstream value; this client creates no propagation-service signature |

Each adapter owns serialization. XMP's `TC260:AIGC` property and the Office custom property named
`AIGC` contain a JSON string of the seven fields. Markdown uses an `AIGC` mapping in its header.
Do not add another `AIGC` wrapper indiscriminately inside properties already named `AIGC`.
Validate character ranges against Annex E and use a confirmed ASCII provider name or identifier.
Placeholder provider values must never reach production files.

- New AI content or edits receive the existing local file/artifact identity or draft revision.
  They do not receive a fabricated upstream production identifier.
- Preserve production identifiers for unchanged copies, renames, moves, and mechanical
  transformations. Record derivative relationships internally rather than claiming the identifier
  is a hash of every resulting file.
- Allocate a local chat export artifact ID when materializing its frozen content. Reuse the artifact
  for retries; its ID is never used as an upstream production or propagation identifier.
- Exclude user, device, session, prompt, and credential information from identifiers and exported
  metadata. Do not embed model requests or account information.

No client-held long-lived signing key is introduced. Evidence manifests use SHA-256 to identify
final sample bytes; a digest is not a digital signature and is not embedded into a file that would
then contain its own digest.

## Format Coverage

These adapters preserve or write established upstream declarations. Their availability does not
establish in-file coverage for new AI content when the upstream service supplies no usable label.

| Format | Metadata location | Preservation and coverage |
| --- | --- | --- |
| PNG | XMP packet in `iTXt` | Modify metadata chunks while preserving compressed pixels, dimensions, and transparency |
| JPEG | XMP packet in APP1 | Preserve EXIF, orientation, color information, and unrelated metadata without another lossy image encode |
| WebP | XMP chunk in the RIFF container | Maintain lengths and feature flags; preserve animation and transparency |
| GIF | XMP packet in an Application Extension | Preserve all frames, timing, looping, and transparency |
| Markdown | `AIGC` in header metadata | Merge existing header properties and preserve the body; apply the reading contract below |
| HTML | `meta name="AIGC"` in `head` | Escape the field string and preserve DOCTYPE, scripts, styles, and body; independently verify this proposed carrier |
| DOCX, XLSX, PPTX | `docProps/custom.xml` in OOXML | Use `property name="AIGC"` with a `vt:lpwstr` value; maintain content types and root relationships, preserving unrelated properties and parts |
| SVG | Future dedicated `metadata` adapter | Confirm namespace and extraction compatibility; preserve vector delivery and do not claim initial coverage |
| Existing PDF | Preserve existing metadata | No new PDF generation or metadata writer is included |
| TXT, JSON, CSV, TSV, YAML, and source code | No general in-file carrier selected | Preserve original content and existing capabilities without claiming in-file labeling |

Image XMP uses the `AIGC` property in `http://www.tc260.org.cn/ns/AIGC/1.0/`. Updating that
property preserves other properties in the namespace. Merge existing canonical labels rather than
leaving conflicting copies.

Unsupported formats retain their existing generation, editing, copying, and sharing behavior.
Do not inject fields, body lines, zero-width characters, or sidecar declarations; force a reading-copy
conversion; or add a sharing restriction. Internal records, sidecars, and an outer ZIP declaration
do not establish that the original file carries metadata. Coverage reports must distinguish them.

## Ownership

Labels live in the files. No database column, migration, `FileEntry` property, backup field, or
persistent manager is introduced. Unchanged byte copies preserve metadata directly. When an
operation re-encodes content, read the source declaration before encoding and pass it temporarily
until the output metadata is restored and read back.

| Existing owner | Responsibility |
| --- | --- |
| Shared label types and temporary processing contracts | Validate the seven file-metadata fields and pass captured labels during processing |
| File service | Identify formats and dispatch metadata reads/writes |
| File creation and draft rewriting | Complete metadata handling before publishing bytes and committing the final size |
| Office service | Process custom properties in the existing compute sandbox |
| Document export service | Restore inherited labels on temporary outputs; clear obsolete declarations on AI-authored outputs |
| App-shell file export | Restore source metadata after brand composition; keep ordinary byte-copy delivery |
| File reading and text-editing tools | Preserve reading presentation and return coordinates matching final stored text |

Frontend derivatives use `FileModule.completeExportFile`, which reads a referenced managed source
and finalizes only caller-owned cache outputs. Cancellation and cleanup stay with existing owners.
Reuse existing ZIP, XML, UUID, digest and YAML capabilities. Large Office packages stay on disk and
in the native compute sandbox without whole-package Base64 round trips through the main thread.

## Publication And Transformation

For generation or AI editing:

1. The producing workflow declares AI origin independently of service identity.
2. Finish content processing into the pending output.
3. Inherit a valid original model-image declaration. Otherwise clear superseded AIGC metadata
   from supported-format AI outputs without inventing a replacement.
4. Read completed metadata changes back, record the final size, and publish the version.
5. Unsupported formats retain their original content without an in-file claim.

A supported-format write or read-back failure fails that file operation before successful
publication or workspace-version advancement. Preserve the original and previous successful
versions, using existing rollback and cleanup ownership. A failure does not trigger another model request automatically. Durable reuse of an upstream
response after a labeling failure remains outside this change.

Editing an imported original or historical file produces a new version. Same-turn drafts retain
their controlled rewrite path. Complete metadata handling before replacing a draft, with
content, size, and `updatedAt` updates serialized by the existing write queue.
Filesystem writes and SQLite commits are not one atomic transaction. No success flag is persisted;
crash repair remains outside this change.

Mechanical transformations first read metadata from the source version, then finish the last
content encode before restoring that metadata on the output.
Read back that completed output before publication. Import normalization reads source metadata
before compression. Cropping, rotation, screenshots, chat exports, HTML conversion, and brand
composition follow this rule wherever they produce new bytes. Mechanical transformations preserve
production information; a new AI edit clears the superseded declaration and records the new local
version without inventing upstream production information.

Unchanged saves, copies, uploads, shares, and system opens carry the existing metadata without
another labeling operation. Enterprise WeChat and other upload tools do not need to route files
through the system share panel. A path that re-encodes content owns metadata preservation at that
transformation step. Brand settings continue to control only the existing brand treatment.

## Reading, Final Files, And Caches

For Markdown reading presentation, exclude this feature's `AIGC` header metadata while preserving
the body and existing treatment of other authored content. HTML and Office use their native
metadata locations without changing document layout.

`read_file` and `edit_file` operate on actual stored text so exact replacements and line numbers
agree. If an AI edit removes or changes Markdown header metadata, calculate or adjust the returned
snippet and starting line from the final persisted text. Preserve exact-text copying without
adding a visible notice.

Bind read-back to the actual published file. If a new artifact needs a stable copy, complete that
copy and all processing before checking its metadata and handing it to existing lifetime
management. Checking a source file does not establish that a separate cached output is complete.

Cache identity includes source revision, processing parameters, and metadata-format version.
Metadata completion precedes artifact caching. Failed stable-copy operations remove their partial
outputs; recovery of a cache copy interrupted by process termination remains separate. Unchanged delivery of an already published file
does not require parsing on every share.

Retain existing cancellation signals, operation leases, and cleanup owners. Native work keeps its
resources until it settles. Batch artifacts finish preparation before entering existing batch
delivery; system-sharing and permission ownership remain unchanged.

## Unsupported Formats, Historical Files, And Errors

Missing upstream identity and unsupported carriers do not block ordinary generation, editing or
delivery. Do not fabricate a replacement label. Source inspection is best-effort for ordinary files
without an established declaration. Once a valid label is captured, carrier write/read-back errors
and cancellation use existing operation handling and must not publish an incomplete replacement.

Do not rewrite historical bytes in bulk or require repair before ordinary opening, copying, or
sharing. A later AI edit or transformation follows the corresponding new-output workflow. An
export of historical model answers uses its current producing operation without backfilling message
records.

Identify formats using structure and existing media-type rules. Bound metadata, XML, and
decompression work on untrusted files; do not execute scripts or macros to read labels. Preserve
unrelated metadata, and do not present an upstream signature as valid for newly changed content.
Metadata values are not deliberately logged; existing operation error handling owns failures.

## Evidence And Implementation Sequence

Evidence must come from the actual application version and native build. Describe application and
provider identity, package identifier, platform, channel, producing entry points, covered formats,
field meanings, carrier locations, transformation preservation, and known gaps.

| Material | Contents |
| --- | --- |
| Actual output samples | Files generated, AI-edited, or transformed by that build; no manually labeled substitutes |
| Independent extraction results | Carrier locations, all seven field values, and extractor versions |
| Extraction screenshots or recordings | The generation/editing and saving flow followed by metadata extraction outside the app |
| Sample manifest | Sample and production identifiers, entry point, format, operation, final SHA-256, application version, and native build |
| Technical explanation and reproduction steps | How reviewers reach the entry points and inspect metadata, with unsupported formats stated explicitly |

No visible-label styles or visible-label screenshots are introduced. Use each target store's actual
template for additional declarations or reports; this technical explanation is not a third-party
certification. Separate the application's final output from any later re-save by a receiving app.
Local evidence may use `.context/ai-labeling-evidence/<version>/build-<native-build-number>/` with
samples, extracted metadata, screenshots, recordings, a manifest, and the explanation.

| Phase | Work | Completion evidence |
| --- | --- | --- |
| Metadata and common rules | Fields, upstream role separation, source-file inheritance, format capabilities, and error results | AI edits clear superseded declarations; mechanical conversion restores source metadata; unchanged copies retain their bytes |
| Text and Office files | HTML, Markdown, DOCX, XLSX, PPTX; creation, edits, scripts, and temporary exports | Final-file metadata is readable; body and unrelated package parts survive; Markdown edit coordinates match stored text |
| Images and transformations | PNG, JPEG, WebP, GIF; generation, normalization, editing, capture, and brand composition | Metadata survives final encoding; metadata writes preserve pixels, animation, and transparency |
| Actual evidence | Independent extraction, real samples, and technical explanation | Coverage matches the installation package, exposed paths, and final sample bytes |

Acceptance should exercise first writes, inheritance, repeated writes, conflicts, new AI edits,
draft rewrites, cancellation, interruption, caches, and unsupported formats. Compare pixel and
Office-part preservation, verify text-edit coordinates, and extract labels from final saved and
uploaded samples independently. Record platform-specific behavior, including Photos and sharing
when iOS is included. These are planned acceptance criteria, not completed results.

Complete store-facing coverage still needs formal upstream identity/content information or a
confirmed application-service identity and responsibility, independent HTML carrier acceptance,
and target-store evidence templates. Unsupported raw-data and source-code carriers remain outside the claimed coverage
without becoming a reason to disable existing features.

## Related Owners

- [File Model](./data/file-model.md)
- [File storage and draft rewriting](../../src/backend/services/file/fileStorage.ts)
- [Source inheritance and upload snapshots](../../src/backend/services/file/fileContent.ts)
- [Workspace file writes](../../src/backend/ai/agent/tools/workspaceFileAccess.ts)
- [Exact text editing and result snippets](../../src/backend/ai/agent/tools/editFileTool.ts)
- [Agent image generation](../../src/backend/ai/agent/host/agentImageGeneration.ts)
- [Image generation tool](../../src/backend/ai/agent/tools/painting/generateImage.ts)
- [Painting jobs](../../src/backend/services/paintings/tasks/paintingGenerateJobHandler.ts)
- [Office service](../../src/backend/services/office/README.md)
- [Document export](../../src/backend/services/documentExport/README.md)
- [File export and brand composition](../../src/frontend/appShell/fileExport/README.md)
- [Shared workflow contracts](../../src/shared/contracts/README.md)

# AI Content Metadata

Status: **implemented; native acceptance and store evidence pending**.

The client reads and writes implicit AI-content declarations in file metadata. Known AI outputs
without a usable upstream declaration automatically receive a `CherryStudio` application-service
label and a new content identifier. New AI edits replace superseded declarations with a fresh
application-service label. Valid original model-image declarations retain their inherited fields.
Metadata completion and read-back precede publication of an AI-produced file. No database field
or separate source-fact record is added.

Only actual AI file-generation/editing operations create declarations. Sharing, chat screenshots,
HTML/Markdown exports, HTML-to-image/PPTX conversions, brand composition and system-preview copies
are programmatic outputs: these paths neither infer AI origin nor add or restore declarations.
Sharing an original file without re-encoding retains its existing bytes; it does not label again.

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

## Service Identity And Validation

The automatic writer uses `CherryStudio` as this application's generation-service name, not a
registration code, model-vendor identity, or arbitrary relay identity. This follows the product
decision to declare the application's own generation service when no usable upstream declaration
is available. No additional environment setting or user-entered provider name is required.
That product decision does not establish regulatory registration or store approval. A selected
model, editable Provider nickname, protocol family or arbitrary endpoint does not establish an
upstream service identity.

- Preserve the producer, production ID, propagator, propagation ID and declared confidence from an
  existing valid upstream label. Original model-image responses can supply such declarations.
  Malformed or conflicting original model-image metadata remains an operation error; it is not
  silently treated as missing metadata.
- Known AI generation without an upstream declaration writes `Label="1"`, the application-service
  name, and a newly allocated content UUID. Under Annex E's initial-write rule, the propagation
  service and identifier match the production service and identifier. Reserved signature fields
  are empty. No source record is created outside the file.
- AI-authored text containing an AIGC header is not trusted as upstream service metadata. Replace
  that declaration with the application's own label.
- A new AI edit replaces superseded AIGC declarations on its pending supported-format output with
  a new application-service content identifier; historical source bytes remain intact. It cannot
  keep an old producer's ID or signature for changed content.
- Managed-file import normalization and local image editing can retain declarations already read
  from their source. They never label an ordinary file by assigning a local UUID or platform
  identity. Programmatic sharing/rendering does not invoke this preservation capability.
- Ordinary files and unlabeled mechanical conversions do not receive an AI classification merely
  because they pass through this module.
- Cherry's managed entry IDs/revisions and temporary artifact IDs identify local files. The
  automatic writer allocates a separate content UUID for its application-service declaration;
  none of these identifiers is represented as issued by an upstream model service.

Automatic writes address missing upstream declarations for the supported file carriers. They do
not establish complete coverage for unsupported formats or replace operator-role confirmation,
native acceptance, independent extraction, or store evidence. Empty or invented provider values
and private AI flags are not substitutes. Carrier write/read-back failures remain operation errors
for both inherited and automatically created labels.

This capability reads and writes TC260 `AIGC` declarations. C2PA signed Content Credentials and
model-level watermarks such as SynthID are separate provenance mechanisms. Unchanged file copies
retain their bytes, but this client neither validates C2PA signatures nor issues replacement
credentials after content changes. Preserving an AIGC declaration during managed-file editing does not establish
that a C2PA credential remains valid or that a content watermark survives. Record those mechanisms
separately in output evidence instead of counting them as AIGC metadata coverage.

Implementation owners are `file/aiContentMetadata.ts`, `file/imageMetadata.ts`,
`shared/utils/aiContentText.ts`, and `office/officeMetadata.ts`. AI operations are explicit in
Agent and painting producers. Managed-file normalization inspects source metadata before encoding,
without backfilling records or rewriting historical blobs. XMP, legacy PNG AIGC text, and EXIF
ImageDescription/UserComment declarations are read before image normalization; canonical image
writes use XMP. Metadata inspection is bounded, and image codec payloads are copied without decoding.

AI-produced document outputs separately set their file-property author to `Cherry Studio` before
publication. This author is not the AIGC `ContentProducer` field: its application-service value
remains `CherryStudio`. DOCX/XLSX/PPTX use core `dc:creator`, Markdown uses front-matter `author`,
and HTML uses a head `meta name="author"` property. The shared pending-output completion boundary
covers fixed generators, Office scripts and AI edits without rewriting historical source files.
Inherited labels and ordinary imports do not override authors. Raw formats such as TXT, JSON and
CSV retain exact content without added author lines or sidecars.

Regression suites cover field validation, source-file inheritance, text carriers/projections, image
containers/EXIF, Office custom properties and native-job lifetime, production/inheritance behavior,
and edit coordinates. Verification and extracted samples belong to the exact source revision
recorded in the evidence; earlier sharing-label samples do not establish the current sharing policy.
Container fixtures do not establish
native image decoding, Office rendering fidelity, Photos retention, or recipient behavior.

## Producing And Transforming Files

Producing callers explicitly declare AI generation/editing for the current write operation. The
existing `provenance` field keeps its original meaning and is not used to infer AI origin. Source
files are the source of truth for inherited declarations; temporary operation inputs carry only
labels read from their bytes.

| Producing path | Metadata handling |
| --- | --- |
| Agent `write_file` and `edit_file` | Write a fresh application-service label on supported-format AI outputs, replacing superseded declarations |
| Office creation, editing, and script outputs | Write a fresh application-service AIGC property; read-only scripts create no file |
| Agent image generation, image tools, and painting jobs | Retain a valid declaration from an original model response; otherwise write an application-service label |
| Programmatic sharing, chat exports, screenshots, HTML conversion, brand composition, and system previews | Do not infer AI origin, inspect source declarations for inheritance, or write declarations on rendered outputs |
| Imported files | Read existing labels before normalization or compression and restore them afterward |
| Managed-image cropping and rotation | Retain captured existing source metadata without creating a new AI classification |
| Copies, workspace attachments, upload snapshots, and unchanged delivery | Keep original file bytes; no separate origin record is needed |
| MCP results, desktop resources, downloads, and historical files | Keep existing metadata without guessing origin from filenames or provenance values |

Parsed upstream metadata is a source declaration, not authenticated provenance. A new AI
modification supersedes the previous content declaration. Its new identifier belongs to the
application service, not the upstream model service.

## Fields And Identifiers

Use the seven Annex E fields, with string values and one canonical metadata label per file.

| Field | Rule |
| --- | --- |
| `Label` | Automatically created labels use `"1"` for known AI output; inherited declarations retain `"1"`, `"2"` (possibly AI-generated), or `"3"` (suspected AI-generated) |
| `ContentProducer` | `CherryStudio` for an application-service label, otherwise the inherited service-provider name or code; never inferred from a model or editable Provider nickname |
| `ProduceID` | A fresh content UUID for an application-service label, otherwise the inherited producer's identifier; local managed-file identity is separate |
| `ReservedCode1` | Empty for a new application-service label; retain the inherited value for unchanged or mechanically transformed content |
| `ContentPropagator` | Equal to `ContentProducer` on an application's initial write under Annex E; inherited propagation-service identity remains independent |
| `PropagateID` | Equal to `ProduceID` on an application's initial write; inherited propagation identifiers remain independent |
| `ReservedCode2` | Empty for a new application-service label; retain the inherited value for unchanged or mechanically transformed content |

Each adapter owns serialization. XMP's `TC260:AIGC` property and the Office custom property named
`AIGC` contain a JSON string of the seven fields. Markdown uses an `AIGC` mapping in its header.
Do not add another `AIGC` wrapper indiscriminately inside properties already named `AIGC`.
Validate character ranges against Annex E and use a confirmed ASCII provider name or identifier.
Placeholder provider values must never reach production files.

- New AI content or edits receive the existing local file/artifact identity or draft revision and,
  when labeled by the application, a separate new service-content UUID. This is not an upstream
  production identifier.
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

These adapters preserve inherited declarations and automatically write application-service labels
for known AI outputs without usable upstream metadata. Carrier availability alone does not establish
native fidelity, independent extraction compatibility, or complete store-facing coverage.

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
persistent manager is introduced. Unchanged byte copies preserve metadata directly. Managed-file
normalization and image editing can capture an existing source declaration before encoding and
restore it on their new managed version. Sharing/rendering remains outside metadata writing.

| Existing owner | Responsibility |
| --- | --- |
| Shared label types and temporary processing contracts | Validate the seven file-metadata fields and pass captured labels during processing |
| File service | Identify formats and dispatch metadata reads/writes |
| File creation and draft rewriting | Complete metadata handling before publishing bytes and committing the final size |
| Office service | Process custom properties in the existing compute sandbox |
| Document export service | Render programmatic share outputs without AI-origin inference or declaration writes |
| App-shell file export | Apply existing brand treatment and deliver files without AI metadata writing |
| File reading and text-editing tools | Preserve reading presentation and return coordinates matching final stored text |

Frontend sharing exposes no AI metadata completion port. Actual AI producers own declarations on
their published files; cancellation and cleanup stay with existing owners.
Reuse existing ZIP, XML, UUID, digest and YAML capabilities. Large Office packages stay on disk and
in the native compute sandbox without whole-package Base64 round trips through the main thread.

## Publication And Transformation

For generation or AI editing:

1. The producing workflow declares AI origin independently of service identity.
2. Finish content processing into the pending output.
3. Inherit a valid original model-image declaration. Otherwise replace superseded or AI-authored
   AIGC metadata with a fresh application-service declaration on supported-format AI outputs.
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

Managed-file normalization and local image editing can capture an existing declaration before
encoding and restore it afterward. They do not create new application-service content identifiers.
A new AI edit does replace the superseded declaration with a new application content identifier
and records the new local version without inventing upstream production information.

Sharing and document export do not perform this metadata processing. Selected assistant text or
AI-generated images do not turn a program-rendered share artifact into a new AI file. Generated
Markdown/HTML, screenshots, converted PNG/PPTX and branded/system-preview copies use the existing
rendering pipeline without creating or restoring AIGC declarations. Byte-copy delivery retains
the original file, including its existing metadata.

Unchanged saves, copies, uploads, shares, and system opens carry the existing metadata without
another labeling operation. Enterprise WeChat and other upload tools do not need to route files
through the system share panel. Brand settings continue to control only the existing brand treatment.

## Reading, Final Files, And Caches

For Markdown reading presentation, exclude this feature's `AIGC` header metadata while preserving
the body and existing treatment of other authored content. HTML and Office use their native
metadata locations without changing document layout.

`read_file` and `edit_file` operate on actual stored text so exact replacements and line numbers
agree. After an AI edit adds or changes Markdown/HTML metadata, read the final persisted text to
calculate the returned snippet and starting line. Preserve exact-text copying without
adding a visible notice.

Bind AI-operation read-back to the actual published file. A pending AI file completes its content
and metadata processing before publication. Sharing's stable-copy lifetime remains independent
of AI metadata and does not require a label on program-rendered artifacts.

Share cache identity includes source revision and processing parameters, with no AI metadata
version or completion callback. Failed stable-copy operations remove their partial
outputs; recovery of a cache copy interrupted by process termination remains separate. Unchanged delivery of an already published file
does not require parsing on every share.

Retain existing cancellation signals, operation leases, and cleanup owners. Native work keeps its
resources until it settles. Batch artifacts finish preparation before entering existing batch
delivery; system-sharing and permission ownership remain unchanged.

## Unsupported Formats, Historical Files, And Errors

Missing upstream identity triggers application-service labeling for known AI outputs in supported
formats; it does not require a provider setting. Unsupported carriers retain ordinary generation,
editing and delivery behavior. Source inspection is best-effort for ordinary files without an
established declaration. For inherited or automatically created labels, carrier write/read-back
errors and cancellation use existing operation handling and must not publish an incomplete replacement.

Do not rewrite historical bytes in bulk or require repair before ordinary opening, copying, or
sharing. A later AI edit follows the new AI-output workflow. An export of historical model answers
is programmatic rendering and neither labels the export nor backfills message records.

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
| Metadata and common rules | Fields, application-service creation, upstream role separation, format capabilities, and error results | Known AI outputs are labeled; AI edits receive new application content identifiers; ordinary/program-rendered files get no new classification; unchanged copies retain their bytes |
| Text and Office files | HTML, Markdown, DOCX, XLSX, PPTX; actual AI creation, edits and script outputs | Final-file metadata is readable; body and unrelated package parts survive; Markdown edit coordinates match stored text |
| Images and managed versions | PNG, JPEG, WebP, GIF; AI generation and preservation during managed-file normalization/editing | AI outputs finish metadata before publication; metadata-only writes preserve pixels, animation, and transparency |
| Actual evidence | Independent extraction, real samples, and technical explanation | Coverage matches the installation package, exposed paths, and final sample bytes |

Acceptance should exercise first writes, inheritance, repeated writes, conflicts, new AI edits,
draft rewrites, cancellation, interruption, caches, and unsupported formats. Compare pixel and
Office-part preservation, verify text-edit coordinates, and extract labels from final saved and
uploaded samples independently. Record platform-specific behavior, including Photos and sharing
when iOS is included. These are planned acceptance criteria, not completed results.

Complete store-facing coverage still needs application-operator responsibility and registration
to match the declared service, native acceptance, independent HTML carrier acceptance, and target-store
evidence templates. Unsupported raw-data and source-code carriers remain outside the claimed
coverage without becoming a reason to disable existing features.

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

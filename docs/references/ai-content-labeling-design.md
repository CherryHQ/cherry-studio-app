# AI Content Metadata Labeling Design

Status: **design; not implemented**.

This design adds implicit AI-content labels to file metadata when Cherry Mobile generates or
AI-edits a file. The producing workflow declares the source, finishes the content, writes and
reads back the metadata, and then publishes the file version. The metadata travels with the file.

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

Use the final practice guides when implementing each adapter. HTML and future SVG adapters still
need a precise encoding and independently readable samples. This design does not add a visible-label
implementation or the agreement and logging workflow for delivery without visible labels.

## Source Facts

Keep `provenance` as the existing classification of how a file entered storage. Record AI-content
facts separately. Neither a filename, an arbitrary tool result, nor `provenance: 'generated'` alone
proves that content was AI-generated.

| Producing path | Source declaration and handling |
| --- | --- |
| Agent `write_file` and `edit_file` | The tool host declares AI creation or modification; supported formats receive metadata before publication |
| Office creation, editing, and script outputs | The Agent adapter declares the output; read-only scripts create no file or content identifier |
| Agent image generation, image tools, and painting jobs | The generation call establishes AI origin; inspect upstream metadata before retaining or supplying production information |
| Chat exports containing model answers or known AI assets | The export adapter freezes the selected content and declares its origin before creating the output |
| Exports containing only user text without known AI assets | Preserve ordinary export behavior without adding an AI-generation assertion |
| Imported files | Preserve existing labels; read origin before import-time normalization or compression |
| Cropping, rotation, format conversion, and brand composition | Inherit existing AI facts without treating the mechanical operation as new AI creation |
| MCP results, desktop resources, and downloads | Use explicit source facts or existing file labels; unknown origin remains unknown |
| Historical files | Use reliable generation evidence when available; do not infer AI origin from old provenance values alone |

Parsed upstream metadata is a source declaration, not authenticated provenance. Preserve upstream
production information when inheriting a label. A new AI modification creates new production
information for the resulting content.

## Fields And Identifiers

Use the seven Annex E fields, with string values and one canonical metadata label per file.

| Field | Rule |
| --- | --- |
| `Label` | Use `"1"` for known AI generation or modification; when only inheriting an upstream declaration, retain valid `"1"` (AI-generated), `"2"` (possibly AI-generated), or `"3"` (suspected AI-generated) |
| `ContentProducer` | The applicable service provider's formal name or approved identifier, never a user-editable provider nickname or model name |
| `ProduceID` | A unique content identifier assigned by the producer; reuse the existing UUID capability for locally assigned identifiers |
| `ReservedCode1` | Empty string in the initial implementation |
| `ContentPropagator` | For the generating service's first write, equal to `ContentProducer`; preserve inherited values otherwise |
| `PropagateID` | For the generating service's first write, equal to `ProduceID`; an unchanged local copy does not automatically create a new propagation identifier |
| `ReservedCode2` | Empty string in the initial implementation |

Each adapter owns serialization. XMP's `TC260:AIGC` property and the Office custom property named
`AIGC` contain a JSON string of the seven fields. Markdown uses an `AIGC` mapping in its header.
Do not add another `AIGC` wrapper indiscriminately inside properties already named `AIGC`.
Validate character ranges against Annex E and prefer an approved ASCII provider identifier.
Placeholder provider values must never reach production files.

- Assign a new production identifier for new AI content or a substantive AI edit, including a
  same-turn draft rewrite.
- Preserve production identifiers for unchanged copies, renames, moves, and mechanical
  transformations. Record derivative relationships internally rather than claiming the identifier
  is a hash of every resulting file.
- Allocate a chat export identifier when its content is frozen. Reuse it for retries of the same
  artifact; changed content receives a new identifier.
- Exclude user, device, session, prompt, and credential information from identifiers and exported
  metadata. Do not embed model requests or account information.

No client-held long-lived signing key is introduced. Evidence manifests use SHA-256 to identify
final sample bytes; a digest is not a digital signature and is not embedded into a file that would
then contain its own digest.

## Format Coverage

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
| TXT, JSON, CSV, TSV, YAML, and source code | No general in-file carrier selected | Preserve original content and existing capabilities; record internal AI facts without claiming in-file labeling |

Image XMP uses the `AIGC` property in `http://www.tc260.org.cn/ns/AIGC/1.0/`. Updating that
property preserves other properties in the namespace. Merge existing canonical labels rather than
leaving conflicting copies.

Unsupported formats retain their existing generation, editing, copying, and sharing behavior.
Do not inject fields, body lines, zero-width characters, or sidecar declarations; force a reading-copy
conversion; or add a sharing restriction. Internal records, sidecars, and an outer ZIP declaration
do not establish that the original file carries metadata. Coverage reports must distinguish them.

## Ownership And Persistence

Add nullable `aiContent` JSON to `file_entry` through a database migration. Its minimal contents are
a structure version, source mode (locally generated or inherited), and the canonical fields.
Null means there are no established AI-source facts. Unsupported formats may still have internal
facts; this field does not assert successful metadata embedding.

Do not add an `isLabeled` success flag. Actual file contents establish whether a label is present.
Preserve source facts across versions, queries, workspace copies, upload snapshots, backups, and
restores. Older backups or remote records without those facts map to null.

| Existing owner | Proposed responsibility |
| --- | --- |
| Shared file types and necessary existing contracts | Represent optional AI-source facts as pure data |
| File schema, data service, and migrations | Persist source snapshots with file versions and preserve them in copies |
| File service | Own field validation, format identification, metadata read/write dispatch, and the public capability reused by producers |
| File creation, draft rewriting, and image editing | Connect source declarations, completed bytes, metadata handling, and publication in one operation |
| Office service | Process final package custom properties in the existing compute sandbox |
| Document export service | Label completed temporary HTML, Markdown, images, and HTML-to-PPTX outputs |
| App-shell file export | Restore metadata on the brand-composition outputs it re-encodes; retain ordinary byte-copy delivery |
| File reading and text-editing tools | Distinguish reading presentation from stored text and return results matching final bytes |

Keep the implementation within the file service and reuse its public module boundary. Do not add
a separate top-level labeling service, persistent manager, settings surface, network service, or
global delivery gate. Office package processing uses its existing public capability without
creating cyclic imports between service internals.

Frontend callers use `FileModule`, not concrete backend services, when they need to finalize
metadata on a derived file. The operation receives frozen source facts, the file, and cancellation,
and returns the completed output. Temporary `ExportFile` descriptors and export caches must retain
source facts too. Reuse existing ZIP, XML, UUID, digest, and YAML capabilities. Large Office packages
stay on disk and in the native compute sandbox, without whole-package Base64 round trips through
the main JavaScript thread.

## Publication And Transformation

For generation or AI editing:

1. The producing workflow declares origin and establishes production information.
2. Finish the content and format processing into the pending output.
3. For a supported format, write metadata and read it back from that same final file.
4. Record the resulting size and source facts, then publish the version.
5. For an unsupported format, retain the original content and internal source facts through the
   existing publication path, without reporting in-file labeling success.

A supported-format write or read-back failure fails that file operation before successful
publication or workspace-version advancement. Preserve the original and previous successful
versions, using existing rollback and cleanup ownership. If upstream generation succeeded, retain
its result for a local labeling retry rather than paying for another generation.

Editing an imported original or historical file produces a new version. Same-turn drafts retain
their controlled rewrite path. Prepare complete labeled bytes before replacing a draft, with
content, source facts, size, and `updatedAt` updates serialized by the existing write queue.
Filesystem writes and SQLite commits are not one atomic transaction; detect interrupted
inconsistencies through file reading or repair rather than trusting a database success flag.

For content with established AI-source facts, mechanical transformations first capture the source
version and facts, then finish the last content encode before restoring metadata on the output.
Read back that completed output before publication. Import normalization reads source metadata
before compression. Cropping, rotation, screenshots, chat exports, HTML conversion, and brand
composition follow this rule wherever they produce new bytes. Mechanical transformations preserve
production information; a new AI edit uses new production information.

Unchanged saves, copies, uploads, shares, and system opens carry the existing metadata without
another labeling operation. Enterprise WeChat and other upload tools do not need to route files
through the system share panel. A path that re-encodes content owns metadata preservation at that
transformation step. Brand settings continue to control only the existing brand treatment.

## Reading, Final Files, And Caches

For Markdown reading presentation, exclude this feature's `AIGC` header metadata while preserving
the body and existing treatment of other authored content. HTML and Office use their native
metadata locations without changing document layout.

`read_file` and `edit_file` operate on actual stored text so exact replacements and line numbers
agree. If a first AI edit adds Markdown header metadata, calculate or adjust the returned snippet
and starting line from the final persisted text. Preserve exact-text copying without adding a
visible notice.

Bind read-back to the actual published file. If a new artifact needs a stable copy, complete that
copy and all processing before checking its metadata and handing it to existing lifetime
management. Checking a source file does not establish that a separate cached output is complete.

Cache identity includes source revision, processing parameters, and metadata-format version.
Only completed, checked artifacts enter the reusable cache; a path's existence alone is not
evidence that an interrupted output is complete. Unchanged delivery of an already published file
does not require parsing on every share.

Retain existing cancellation signals, operation leases, and cleanup owners. Native work keeps its
resources until it settles. Batch artifacts finish preparation before entering existing batch
delivery; system-sharing and permission ownership remain unchanged.

## Unsupported Formats, Historical Files, And Errors

An unsupported carrier is a capability result, not a new user-facing failure or delivery block.
Preserve the file and internal origin through the existing operation. A supported carrier's
missing provider configuration, conflicting label, write failure, extraction failure, or cancellation
uses existing operation error handling and must not publish an incomplete replacement.
Distinguish absent metadata from a failed metadata read.

Do not rewrite historical bytes in bulk or require repair before ordinary opening, copying, or
sharing. A later AI edit or transformation follows the corresponding new-output workflow. An
export of historical model answers can establish origin from its actual selection without
backfilling all message records.

Identify formats using structure and existing media-type rules. Bound metadata, XML, and
decompression work on untrusted files; do not execute scripts or macros to read labels. Preserve
unrelated metadata, and do not present an upstream signature as valid for newly changed content.
Logs retain only necessary identifiers, formats, format versions, and error categories.

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
| Source facts and common rules | Fields, provider configuration, migration, inheritance, format capabilities, and error results | AI creation/editing, mechanical conversion, and unknown origin remain distinct across versions, copies, backups, and restores |
| Text and Office files | HTML, Markdown, DOCX, XLSX, PPTX; creation, edits, scripts, and temporary exports | Final-file metadata is readable; body and unrelated package parts survive; Markdown edit coordinates match stored text |
| Images and transformations | PNG, JPEG, WebP, GIF; generation, normalization, editing, capture, and brand composition | Metadata survives final encoding; metadata writes preserve pixels, animation, and transparency |
| Actual evidence | Independent extraction, real samples, and technical explanation | Coverage matches the installation package, exposed paths, and final sample bytes |

Acceptance should exercise first writes, inheritance, repeated writes, conflicts, new AI edits,
draft rewrites, cancellation, interruption, caches, and unsupported formats. Compare pixel and
Office-part preservation, verify text-edit coordinates, and extract labels from final saved and
uploaded samples independently. Record platform-specific behavior, including Photos and sharing
when iOS is included. These are planned acceptance criteria, not completed results.

Implementation still needs the formal provider identity and division of responsibility with
upstream model services, precise adapter encodings for proposed carriers, and target-store evidence
templates. Unsupported raw-data and source-code carriers remain outside the claimed coverage
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

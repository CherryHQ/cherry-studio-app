# Managed Files

`fileStorage` owns managed-file creation, version publication, draft replacement and rollback.
`fileContent` supplies the host's `FileModule`, imports, workspace copies and upload snapshots.
AI operations are declared by producing callers. Labels live in file metadata, with no added database fields.

The module root exposes `completeFileAiContent`, `readFileAiContent` and `readSourceAiContent`
for backend producers and transformations. Read source bytes before encoding and pass the captured
label only for that operation. Only pending, caller-owned outputs may be completed; immutable
managed files must not be edited through this capability.
Frontend callers use `FileModule.completeExportFile`, which accepts only cache-directory outputs
and an optional managed source reference for inherited declarations.
The caller retains publication, cancellation and cleanup ownership.

- `aiContentMetadata` validates inherited declarations, dispatches carriers,
  reads the completed bytes back, and returns the label extracted from the completed file.
- `imageMetadata` builds random-access copy plans for PNG, JPEG, WebP and GIF containers. It changes
  metadata without decoding pixel payloads; `xmpMetadata` owns the TC260 namespace and preserves
  unrelated XMP. Legacy PNG and EXIF AIGC declarations can be inherited.
- `shared/utils/aiContentText` owns Markdown front matter and HTML head metadata. The Markdown
  reading projection hides only valid AIGC metadata; exact reads, copying and edits use stored text.
- `office.processOfficeMetadata` owns OOXML custom properties in the existing native compute pool.

Metadata handling completes before publishing the managed file and committing its final size.
Draft content and metadata are prepared before replacing existing bytes. New AI edits clear
superseded declarations; mechanical transformations restore labels captured from their source.
Unchanged copies retain their bytes. Local file/artifact IDs stay separate from upstream production
IDs. Missing upstream declarations and unsupported raw/code formats add no private flags, sidecars
or delivery restrictions.

See [AI Content Metadata](../../../../docs/references/ai-content-labeling-design.md) for identity policy,
format coverage, upstream declarations, and pending native acceptance.

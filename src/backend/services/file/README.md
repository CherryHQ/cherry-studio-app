# Managed Files

`fileStorage` owns managed-file creation, version publication, draft replacement and rollback.
`fileContent` supplies the host's `FileModule`, imports, workspace copies and upload snapshots.
AI origin is explicit source data separate from `provenance`; old entries stay unknown.

The module root exposes `completeFileAiContent`, `readFileAiContent` and
`createGeneratedAiContent` for backend producers and transformations. `readSourceAiContent` captures
existing source declarations before encoding, including historical blobs without database facts. Only pending, caller-owned
outputs may be completed; immutable managed files must not be edited through this capability.
Frontend callers use `FileModule.completeExportFile`, which accepts only cache-directory outputs
and an optional managed source reference for inherited declarations.
The caller retains publication, cancellation and cleanup ownership.

- `aiContentMetadata` validates source facts and inherited declarations, dispatches carriers,
  reads the completed bytes back, and returns the facts recorded with the file.
- `imageMetadata` builds random-access copy plans for PNG, JPEG, WebP and GIF containers. It changes
  metadata without decoding pixel payloads; `xmpMetadata` owns the TC260 namespace and preserves
  unrelated XMP. Legacy PNG and EXIF AIGC declarations can be inherited.
- `shared/utils/aiContentText` owns Markdown front matter and HTML head metadata. The Markdown
  reading projection hides only valid AIGC metadata; exact reads, copying and edits use stored text.
- `office.processOfficeMetadata` owns OOXML custom properties in the existing native compute pool.

Supported AI writes complete before the final size and source facts are committed. Draft content
and metadata are prepared separately before replacing existing bytes. New AI content without an upstream declaration records facts with a null label; a new AI edit
clears a superseded declaration on its pending output. Mechanical transformations preserve
upstream identity. Local file/artifact IDs remain separate from upstream production IDs. Unsupported raw/code formats
retain literal bytes and internal facts, without an in-file labeling claim or delivery restriction.

See [AI Content Metadata](../../../../docs/references/ai-content-labeling-design.md) for identity policy,
format coverage, upstream declarations, and pending native acceptance.

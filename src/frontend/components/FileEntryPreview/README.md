# FileEntryPreview

Application adapter from a managed `FileEntryId` to CherryUI's business-neutral `FilePreview`.
It resolves the entry and local URI, classifies the file, injects translations, logs preview
failures, and presents an Alert when the system viewer cannot open a file.

`LoadedFileEntryPreview` is the same adapter for a caller that already holds the `FileEntry` — a
list page, say — and accepts original and preview URIs resolved in the same batch as its peers.
Image cards render the bounded WebP preview while opening continues to use the original file.

`FileEntrySkeleton` is the shared same-sized placeholder for both adapters and file-entry grids.

## Classification

`fileEntryPreviewKind` maps a media type onto the kind CherryUI resolves renderers against:
`image`, `text`, `pdf`, and `document` for everything else — audio and video included, since
nothing previews them yet.

Kinds are an open set, so classification may run ahead of rendering. A kind no plugin claims falls
back to the platform preview — an iOS Quick Look thumbnail, an Android extension card — which is
what `document` has always rendered. Naming a format before it has a renderer therefore changes
what a file is called, not how it looks.

## Adding A Preview Kind

Three edits, all in this layer. Word is the worked example; `useDocxCover` and `DocxCover` below
stand in for whatever that format actually needs.

1. Write the renderer under `plugins/`. It receives CherryUI's `FilePreviewComponentProps` and
   draws the preview only — the frame, press target, unavailable state, and system opening stay
   with `FilePreview`, so a plugin cannot diverge on interaction:

   ```tsx
   // plugins/WordPreview.tsx
   import type { FilePreviewComponentProps } from '@cherrystudio/ui/components';

   import { FileEntrySkeleton } from '../FileEntrySkeleton';

   export function WordPreview({ file, size }: FilePreviewComponentProps) {
     const { data, isLoading } = useDocxCover(file.uri);

     if (isLoading) return <FileEntrySkeleton size={size} />;
     return data ? <DocxCover cover={data} size={size} /> : <WordCard file={file} size={size} />;
   }
   ```

   Parsing, caching, loading, and failure states belong to the renderer, because only it knows
   what its format costs to read.

2. Claim the media types in `utils/fileEntryPresentation.ts`:

   ```ts
   const kindByMediaType = new Map<string, FilePreviewKind>([
     ['application/pdf', 'pdf'],
     ['application/msword', 'word'],
     ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'word'],
   ]);
   ```

3. Register the renderer in the provider stack in `src/app/_layout.tsx`:

   ```tsx
   // A module constant: `plugins` is a memo dependency, and a fresh array per render would
   // rebuild the registry and re-render every preview beneath it.
   const previewPlugins = [{ component: WordPreview, kind: 'word' }];

   <FilePreviewPluginProvider plugins={previewPlugins}>
   ```

   Nest a second provider lower down to override a kind for one screen; it inherits every kind it
   does not name, including the platform fallback.

Once several formats exist, fold the media types into the plugin list so a format is declared once
instead of in two files — the media-type mapping stays in this layer either way, because CherryUI
is business-neutral and does not know what a media type is.

## Where A Renderer Belongs

A renderer stays here when it carries business knowledge: a parser, a backend call, a format the
product understands. It belongs in CherryUI only when it needs nothing beyond `file.uri` and a
platform API — which is why `ImagePreview` and the iOS Quick Look thumbnail live there, and a Word
or slide renderer would not.

If several renderers converge on one shape — a cover image with a format badge, say — promote that
presentational primitive to CherryUI and leave each plugin owning only how it produces the cover.
Promote once the third renderer exists, not in anticipation of it.

## What Fails Quietly

- Skipping step 2 or step 3 is silent: the file keeps its previous kind or resolves to the
  platform fallback, and nothing reports a missing renderer. That is deliberate — one unregistered
  plugin must not blank an attachment grid — but it means a wrong kind shows up only as the wrong
  rendering.
- `kind` is an open string on both sides, so a misspelling is not a type error.
- `FilePreviewOperation` is `open | thumbnail`. A parse failure has no name of its own yet;
  reporting it as `thumbnail` gets the right behavior — logged, no Alert — under the wrong label.
  Add a value when a renderer needs one.

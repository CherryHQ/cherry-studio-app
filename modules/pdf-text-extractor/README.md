# PDF and Image Text Extraction

Local Expo module used by attachment preparation and Agent file reads. By default, PDFKit (iOS) and PDFBox
(Android) extract existing text first. A page is rendered for Apple Vision or the bundled ML Kit
Chinese/Latin recognizer only when it has no usable text, or when it draws an image (including in
nested forms) and its text is sparse (fewer than 200 letters or digits). A native page number or
caption therefore cannot suppress recognition of the scanned body, while a text page with a logo or
figure, or a scan that already carries a text layer, keeps its native text without OCR.
Recognition does not send page images to an OCR service.
Normal conversation submission still sends the resulting text to the selected model.

`extractImageText` also recognizes standalone PNG/JPEG/WebP/GIF attachments, using the same native
engines and cancellation queue. Images are decoded to at most a 2560-pixel edge and four million
pixels, with camera orientation applied and transparent backgrounds composited onto white. Only the
first frame is read. The shared result/progress contract represents an image as one recognition
page; the UI shows image recognition without a PDF page counter. Android uses subsampled decoding,
so the decoded image can be smaller than the ceiling. An oriented/opaque copy may coexist with its
bounded source during preparation.

Chat sends image pixels to vision-capable models. For text-only models it automatically sends OCR
text, including when rebuilding history. The model envelope explicitly identifies OCR-only content;
the transcript retains the original attachment and reports that only text was delivered. Current
images without readable text, failed recognition, and unsupported app-language scripts stop submission
with distinct errors. `read_file` and `library_read_file` use the same extraction and text paging for
text-only models. Painting reference images still require native image input.

## Processing and ownership

- At most 100 pages and one million UTF-16 units per document. `isTruncated` reports these ceilings
  independently of errors. PDFBox collects page text and image facts in one traversal, rather than
  calling the whole-document stripper for each page.
- Native extraction and rendering run on a serial background queue / coroutine mutex. A readable
  text-only page never loads the OCR engine. Source PDF metadata rotation is honored when rendering.
- Each rendered page is capped at a 2560-pixel edge, four million pixels, and 3x PDF point scale.
  iOS maps the crop box and `/Rotate` itself, because `CGPDFPage.getDrawingTransform` never scales
  up and would leave the page at 72 dpi in the corner of the bitmap.
  One bitmap is processed at a time and released before proceeding. These bounds do not bound all
  internal allocations made by PDFKit, PdfRenderer, PDFBox, Vision, or ML Kit.
- A nearly white page (fewer than 32 rendered pixels with any RGB channel below 240) is treated as
  blank. Successful OCR with no usable text records the one-based page in `unrecognizedPages`,
  retaining any native text. Covers, illustrations and noisy blanks do not reject the other pages.
  The shared reader prefixes an explicit model-facing notice; attachment reports and tool windows
  retain the page numbers, and the transcript lists them under the sent message's attachments. A
  completely textless document still fails as empty.
  Rendering, parsing and recognition-engine errors still reject partial results. The iOS image
  scan only routes pages: if it cannot parse a page's operators, the page is treated as containing
  images instead of rejecting text PDFKit can read.
- Recognition follows the resolved app language passed as `language`. iOS selects the matching
  Vision language first, then English and Chinese. Vision reads with the first language's model, so
  when that model is not Chinese, automatic language detection lets Chinese lines switch models;
  without it they are dropped. Android's bundled model reads Chinese and Latin.
  When the engine cannot read the app language's script (Greek on iOS; Cyrillic, Greek and Japanese
  on Android), OCR is skipped because the engine would return plausible garbage instead of failing.
  Pages with images are listed in `unrecognizedPages` and `ocrUnavailable` is set; a document left
  without text fails as `document-ocr-unsupported`. A document in another unsupported script attached
  under a supported app language is not detected.
- Results keep page order with blank-line separators, without writing a new PDF or adding library
  entries. OCR supplies visual reading order on mixed pages; native lines missing from that output
  are appended, with whitespace/punctuation-insensitive duplicate suppression. This is text
  extraction, not layout reconstruction. Existing text containing replacement characters is retried.
- `extractPdfText` reserves a native request synchronously before async dispatch. Its optional
  control argument accepts an abort signal and a per-request page-progress callback. Cancellation
  also covers queued requests. Vision receives cancellation directly; ML Kit completes the current
  task before its input bitmap is recycled. Native parsing/rendering is cooperative between stages.
- Native failures are classified by the shared document reader. No partial text is sent after a
  page failure. Byte limits remain owned by the managed-file reader.

## Reuse and cancellation

`src/backend/services/file/fileTextExtraction.ts` shares PDF/image extraction between concurrent consumers and
reuses the same derived disk result for attachments, later turns and file tools. Cache keys include
the managed filename (immutable entry ID), byte size, modification time, extraction-policy version,
source kind, page ceiling, app language and the selected local model revision. Existing system OCR
cache keys remain unchanged. Availability/authorization and source byte limits are checked before cache access.
No successful text results or page images accumulate in a process-wide memory cache.

`fileTextCache.ts` owns the disposable `Paths.cache/PdfText` directory (the existing directory name
is retained for cleanup of older results): at most 64 MiB retained,
8 MiB per entry, at most 256 entries, validated JSON, best-effort writes, oldest-write eviction. Hard deletion removes
that entry's cache and the restore gate clears the directory. Policy changes, eviction, OS cache
purging or corrupt cache files require extraction again; ordinary follow-up reads reuse it.

Each consumer can stop immediately. Only the last consumer cancels the shared native request;
the extraction slot remains occupied until native cleanup finishes. Aborted or failed extraction
is never cached; a standalone image in an unsupported app language is not cached either. An empty
image result is cached so history rebuilds do not recognize it again.
`observeFileOcr` aggregates each file's extraction states, preferring active
recognition over queued reads. Cancelling or finishing one extraction cannot clear another's state.
A running `read_file` call links its call ID to the entry it resolved, so its row follows reads by
workspace path as well as by entry ID.
The transcript tile and a running `read_file` row show a neutral processing wait while queued,
including for text PDFs. Queue state ends when extraction starts; recognition progress appears
only after OCR begins. The pending reply names scan recognition only while it is active. A cache
hit reports nothing.

## Integration

### Optional Xiaomi-OCR-0 model

General settings exposes one **Scanned document recognition** row beside the existing AnyDoc parser.
Its compact sheet contains system/model choices and inline download, pause, resume and removal
controls. Model size, progress and failures stay in that sheet rather than filling the settings page.
The document parser still owns Office files; PDF/image recognition has its own `file.ocr.engine`
preference. System recognition remains the default. Downloading both verified model files enables
Xiaomi-OCR-0; deleting them cancels active local recognition and restores the system preference.
An app binary missing either native bridge keeps system recognition available and disables download.

`createLocalOcrModule.ts` in the backend file owner is created by bootstrap and disposed with that
generation. Its file-module surface owns download, pause and removal commands; route unmount only
unsubscribes. `createOcrModelDownload.ts` streams into
`Documents/LocalModels/xiaomi-ocr-0-q4km-0f0e77db-v1`, outside managed user files and the app's backup
storage tree. It pins the [community conversion](https://huggingface.co/prithivMLmods/Xiaomi-OCR-0-GGUF/tree/0f0e77db7c97c409bb87347e6c2f151829651947)
and SHA-256 hashes for the 529,297,664-byte Q4_K_M language model and 207,346,624-byte BF16 vision
projector. Downloads pause on backgrounding and persist Expo's resume token; verified files survive
restarts. A failed/expired resume token restarts that file on retry. Startup verifies installed
weights again; size alone never establishes readiness. No weights ship in the application package.

`llama.rn` 0.12.9 supplies the local inference runtime. iOS requests Metal; Android uses CPU for this
quantization. The Expo config plugin is unnecessary here: the app already uses C++20, and this path
does not request OpenCL/Hexagon or additional iOS memory entitlements. Its dependency install step
downloads published native binaries; this is separate from downloading the OCR model in the app.
A new development client is required for both the dependency and the new page/image bridge methods.

The selected model uses the shared serial file-extraction queue, progress, cancellation and disk
cache. `readPdfPages` inspects bounded text layers without system OCR, retaining source page numbers
and per-page truncation. Ordinary reading renders only pages marked `needsOcr` through `renderPdfPage`;
explicit structural tasks render the requested pages even when they already contain text.
Each nonblank page has a 2048-pixel maximum edge and shares
the existing four-million-pixel ceiling. `prepareOcrImage` uses the existing bounded first-frame
decoder, orientation and white alpha background. One temporary JPEG lives in `Caches/LocalOcr` at a
time and is removed after recognition, cancellation or failure. The model context is loaded lazily
and released after each request; ordinary text-only PDF reads never load it. Cross-turn recurrent-state caching
is disabled because document pages are independent.

Recognition uses Xiaomi's whole-page document prompt with thinking disabled, at most 1024 image
tokens, an 8192-token context and 4096 generated tokens per page. Output and page limits remain
visible through `isTruncated`; failed pages do not return partial text. OTSL table grids are converted
to escaped HTML with merged cells retained; malformed grids and LaTeX remain verbatim. This is the
single-model whole-page path, without the official external layout detector. It does not establish
equivalence with official benchmark scores or guarantee phone memory, speed or accuracy. The
[official model](https://huggingface.co/xiaomi-research/Xiaomi-OCR-0) is Apache-2.0; community
quantization and mobile behavior require their own acceptance.

Source regressions cover checksum rejection, restart verification, persisted pause/resume, engine
cache isolation, cancellation during template preparation, resource release and truncation. They
are not evidence of an executed test run. Device acceptance should additionally cover network
interruption, insufficient storage, backgrounding, model deletion while reading, multi-page memory,
and real Chinese/English scans on both platforms.

### Explicit document tasks

The [file owner](../../src/backend/services/file/README.md) exposes `extractDocument` and the thin
`extract_document` Agent tool. Task requests select at most eight PDF pages within the first 100.
`readPdfPages` accepts an optional one-based page list and returns only that selection. Table and
formula tasks retain structured whole-page output; fields use a dedicated constrained-JSON prompt,
and questions use a short document-image answer prompt. Question output is limited to 1024 tokens;
other tasks retain the 4096-token ceiling. Results preserve raw output and actual engine/status.
System OCR can supply document text but never substitutes for unavailable structural recognition.

Office parsing keeps AnyDoc's native structure. A specifically selected embedded image can enter
the same queue through a size-checked temporary file. Task, pages, fields, question, embedded image
identity and task version extend the existing cache key. Temporary assets survive consumer abort
until native processing settles. The Agent can pass complete structured results to the existing
Office tools after model release. Users work through chat attachments or existing preview selections;
there is no separate extraction screen. Ordinary chat attachment delivery remains unchanged.

### System recognizers

iOS links the system Vision framework. Android uses
`com.google.mlkit:text-recognition-chinese:16.0.1`, which recognizes both Chinese and Latin and
includes its model in the installation package. No first-use model download is needed, and devices
without Google Play services work. For the arm64-v8a package this adds about 11 MB of native
library (stored uncompressed), 2.4 MB of models and 1 MB of classes before R8, measured from the
published AARs (`text-recognition-bundled-common` 17.0.0 and `text-recognition-chinese` 16.0.1).

This changes the native bridge and requires a new development client. Installing JS dependencies
or publishing an OTA update alone cannot enable OCR. See [Local EAS Builds](../../docs/guides/local-builds.md) and
[Testing And CI](../../docs/guides/testing-and-ci.md).

## Acceptance coverage

JS regression sources cover persisted reuse, concurrent readers, independent cancellation, late-result
rejection, cache eviction/deletion/restore, partial-page metadata and the existing size/truncation
policy. Android instrumented fixtures contain a native text page, a Chinese/English scanned page
with a native page number, a blank page and an illustration. They exercise
the real bundled recognizer; their presence is not evidence that native acceptance has been run.

Platform acceptance covers text-only, scanned, mixed, blank, rotated, encrypted,
corrupt, and over-100-page PDFs. Include first-use offline recognition, cancellation during a page
and while queued, repeated reads and concurrent consumers, memory on long documents, and the tile,
pending-reply and tool-row progress in both themes. Include a text PDF with a logo on every page (no OCR expected), a rotated
scan on iOS, and Russian/Japanese app languages. Include images inside nested forms and inline images. Check Chinese and
English recognition on representative physical devices. Complex tables/formulas and reading order
from the optional model remain pending real-sample acceptance; searchable-PDF export remains separate work.

Image acceptance additionally covers text-only versus vision models, OCR-only transcript notices,
first-use offline PNG/JPEG/WebP/GIF reads, first-frame behavior, EXIF rotation/mirroring, transparent
backgrounds, empty/failed/unsupported recognition, shared cancellation/cache reuse and history model
switches. Android instrumented sources exercise bounded image decoding, EXIF orientation and the
bundled recognizer. Added source coverage does not imply that native or device checks have run.

References: [Apple Vision](https://developer.apple.com/documentation/vision/vnrecognizetextrequest),
[ML Kit Android setup](https://developers.google.com/ml-kit/vision/text-recognition/v2/android),
[Chinese and Latin recognizer](https://developers.google.com/android/reference/com/google/mlkit/vision/text/chinese/ChineseTextRecognizerOptions).

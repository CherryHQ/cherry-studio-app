# PDF Text Extraction

Local Expo module used by attachment preparation and Agent file reads. PDFKit (iOS) and PDFBox
(Android) extract existing text first. A page without usable text is rendered for Apple Vision or
the bundled ML Kit Chinese/Latin recognizer. Recognition does not send page images to an OCR service.
Normal conversation submission still sends the resulting text to the selected model.

## Processing and ownership

- At most 100 pages per document. `isTruncated` reports the page ceiling independently of errors.
- Native extraction and rendering run on a serial background queue / coroutine mutex. A text page
  never loads the OCR engine. Source PDF metadata rotation is honored when rendering.
- Each rendered page is capped at a 2560-pixel edge, four million pixels, and 3x PDF point scale.
  One bitmap is processed at a time and released before proceeding. These bounds do not bound all
  internal allocations made by PDFKit, PdfRenderer, PDFBox, Vision, or ML Kit.
- A nearly white page (fewer than 32 rendered pixels with any RGB channel below 240) is treated as
  blank. Nonblank pages that yield no usable text fail with `ocrError` and `extractionError`.
  This deliberately avoids silently omitting an unreadable scanned page. Image-only covers and
  pages with no recognizable text may therefore require attaching those pages as images.
- Results keep page order with blank-line separators, without writing a new PDF or adding library
  entries. Existing text containing replacement characters is retried through OCR.
- `extractPdfText` reserves a native request synchronously before async dispatch. Its optional
  control argument accepts an abort signal and a per-request page-progress callback. Cancellation
  also covers queued requests. Vision receives cancellation directly; ML Kit completes the current
  task before its input bitmap is recycled. Native parsing/rendering is cooperative between stages.
- Native failures are classified by the shared document reader. No partial text is sent after a
  page failure. Byte limits remain owned by the managed-file reader.

## Integration

iOS links the system Vision framework. Android uses
`com.google.mlkit:text-recognition-chinese:16.0.1`, which recognizes both Chinese and Latin and
includes its model in the installation package. No first-use model download is needed.

This changes the native bridge and requires a new development client. Installing JS dependencies
or publishing an OTA update alone cannot enable OCR. See [Local EAS Builds](../../docs/guides/local-builds.md) and
[Testing And CI](../../docs/guides/testing-and-ci.md).

## Acceptance coverage

JS regression sources cover abort propagation, late-result rejection, listener cleanup, OCR failure
classification, ordered mixed-page text, and the existing size/truncation policy. Android instrumented
fixtures contain a native text page, a Chinese/English scanned page, and a blank page. They exercise
the real bundled recognizer; their presence is not evidence that native acceptance has been run.

Platform acceptance covers text-only, scanned, mixed, blank, rotated, encrypted,
corrupt, and over-100-page PDFs. Include first-use offline recognition, cancellation during a page
and while queued, memory on long documents, and the activity notice in both themes. Check Chinese
and English recognition on representative physical devices. Complex tables/formulas, reconstruction
of multi-column reading order, and images embedded within an otherwise readable text page are outside
this initial extraction path. Searchable-PDF export is separate work.

References: [Apple Vision](https://developer.apple.com/documentation/vision/vnrecognizetextrequest),
[ML Kit Android setup](https://developers.google.com/ml-kit/vision/text-recognition/v2/android),
[Chinese and Latin recognizer](https://developers.google.com/android/reference/com/google/mlkit/vision/text/chinese/ChineseTextRecognizerOptions).

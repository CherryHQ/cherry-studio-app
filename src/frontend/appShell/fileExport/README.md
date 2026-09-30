# File Export

Application-wide watermark preparation, system sharing and add-only Photos saving. Preview
components and pages consume this module; this module does not import page code.

## Configuration

Application entry points accept `FileExportOptions`: `{ watermark?: 'cherry' | 'none' }`.
Omitted styles follow the global Share watermark setting (`file.export.watermark_enabled`), which
defaults to enabled and lives under Settings > General. `useExportWatermarkStyle` resolves this
preference; explicit `cherry` or `none` options override it for that request.
`useDocumentExport().open` freezes the resolved style for
every offered format. `useHtmlConversion(options)` also uses it for PNG and PPTX. PPTX applies the
footer only to the final captured slide, without adding a slide.

`useExportWatermark` resolves the selected style into an `ExportWatermark` once per operation.
The `cherry` variant carries the original artwork, constant white/black colors, Cherry brand color,
localized tagline/download copy and download QR data; `none` carries no rendering data.
`shared/utils/exportSignature.ts` owns validation and footer geometry: a white surface with a Cherry
red top rule, brand and copy on the left, and an 84-point QR area on the right, with a 120-point
minimum height at 360 points wide. Text wrapping can increase the height. New styles extend the
closed style/variant contract and its renderers, rather than adding booleans to feature pages.
Markdown renders the same brand/copy and a download link when configured, without image bytes.

`exportBrand.ts` owns `downloadUrl` and its matching embedded PNG `qrCodeDataUrl`, pointing to
`https://www.cherryai.com.cn/download?platform=mobile`. The QR asset includes a four-module white
quiet zone and is embedded for offline export, sampled without smoothing. Regenerate the PNG when
changing the URL. HTML and Markdown links use the same HTTPS URL. If the download configuration is
cleared, the QR area shows a localized placeholder and no download link is emitted.

## Source And Finalized Files

`prepareImageExport` appends a footer to a disposable PNG without resizing or overwriting the source.
`none` returns the original image without decoding, re-encoding or changing its format.
`prepareFileExport` supplies matching filename and media type; non-image source files pass through.
SVG files also pass through with their original bytes, filename and media type for sharing and system
opening, without a footer, because the image renderer only decodes bitmaps.
The in-app preview and original image used for editing retain their bytes.

The global preference is persisted; each export resolves its own watermark selection without adding
file metadata. Existing `document-export` files are completed outputs: ordinary sharing and photo
saving reuse their exact bytes, whether the generating request used `cherry` or
`none`. Choosing a different style requires a new export from source; `none` does not remove a footer
already baked into pixels or authored content.

Document HTML/image capture applies the resolved watermark during rendering, avoiding a second
bitmap pass. HTML-file conversion uses the shared image renderer before persistence. Completed
files then follow the existing file-delivery policy without another watermark pass.

## Delivery And Lifetime

`shareFile(source, { watermark, signal })` checks system availability before invoking an optional
source factory. Document and HTML callers put generation/persistence in that factory. It checks
cancellation before admission, after asynchronous preparation and before opening the system sheet,
and releases its prepared temporary image even when cancellation wins.

`shareFiles(source, { watermark, signal })` admits an ordered collection or its asynchronous
factory through the same availability and cancellation checks. Document exports use it for paged
PNG delivery. All files are prepared and copied before one chooser opens: single-file delivery uses
Expo Sharing, while multiple files use React Native Share. Completed document pages are copied
without re-encoding, and a failed copy never opens a partial share sheet.

`useShareFile` owns ordinary-file busy state, unmount cancellation and localized feedback.
`useSaveImageToPhotos` owns add-only permission guidance and releases its prepared image after
Photos copies it. System opening reuses `prepareFileExport`.

Shared/system-open copies remain in the OS-managed cache because recipients may read after the
chooser closes. A preparation failure fails delivery rather than sending a differently treated
original. Sheet dismissal does not establish recipient delivery.

Native rendering, Photos saving and recipient delivery still require device acceptance.

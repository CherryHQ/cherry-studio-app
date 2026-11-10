# File Export

Application-wide watermark preparation, system sharing and add-only Photos saving. Preview
components and pages consume this module; this module does not import page code.

## Configuration

Sharing entry points accept `FileExportOptions`: `{ watermark?: 'cherry' | 'none' }`.
Omitted styles follow the global Share watermark setting (`file.export.watermark_enabled`), which
defaults to enabled and lives under Settings > General. `useExportWatermarkStyle` resolves this
preference; explicit `cherry` or `none` options override it for that request.
`appShell/sharing` freezes the resolved style for sharing. Users choose watermark only in global
settings, with no watermark controls in the sharing panels. Original bitmap sharing also uses that
style; other original files retain their bytes. HTML conversion uses the selected style for shared
PNG and PPTX. PPTX applies the
footer only to the final captured slide, without adding a slide.

`useExportWatermark` resolves the selected style into an `ExportWatermark` once per operation.
The `cherry` variant carries official app artwork, Cherry brand color, localized download copy
and the download QR code; `none` carries no rendering data. Its default `white` surface uses
constant white/black colors and the light icon. Message images request the `card` surface, which
uses content colors, the matching light/dark icon and short scan copy. The document renderer owns
the inset separator, whitespace and complete unclipped footer for that layout.
`shared/utils/exportSignature.ts` owns validation and the default footer geometry: one white row under a Cherry
red rule, with the logo, brand and scan copy on the left and a 48-point QR code on the right. At 360
points wide it is 66 points tall; wrapped copy can increase the height. New styles extend the closed
style/variant contract and its renderers, rather than adding booleans to feature pages. Markdown
renders the brand and a download link without image bytes.

`exportBrand.ts` embeds proportional 96px derivatives of `assets/icon-light.png` and
`assets/icon-dark.png`, preserving the official artwork for offline delivery. It also owns
`downloadUrl` and its matching embedded PNG `qrCodeDataUrl`, pointing to
`https://www.cherryai.com.cn/download?platform=mobile`. The recipient, not the sender, scans the
code, so the sender's install channel cannot choose the store; the website owns per-device routing.
The QR asset includes a four-module white quiet zone, is embedded for offline export and is sampled
without smoothing. Regenerate the PNG when changing the URL.

## Source And Finalized Files

`prepareImageExport` appends a footer to a disposable PNG without resizing or overwriting the source.
`none` returns the original image without decoding, re-encoding or changing its format.
`prepareFileExport` supplies matching filename and media type; non-image source files pass through.
SVG files also pass through with their original bytes, filename and media type for sharing and system
opening, without a footer, because the image renderer only decodes bitmaps.
GIF files retain their original bytes, filename and media type for Photos saving, sharing and system
opening, even when a watermark is selected: the footer renderer would flatten their animation to a
single PNG frame. The source media type identifies GIFs; URI-only callers fall back to the file
extension.
The in-app preview and original image used for editing retain their bytes.

The global preference is persisted; each export resolves its own watermark selection without adding
AI-source metadata. Managed bitmap files, including saved `document-export` images, follow the selected
style when shared. Local photo saving retains the supplied bytes. `none` does not remove a footer
already baked into pixels or authored content.

Document HTML/image capture applies the resolved watermark during rendering, avoiding a second
bitmap pass. HTML-file conversion uses the shared image renderer before persistence. Completed
temporary `ExportFile` descriptors are copied without another watermark pass; managed files later
selected from the library follow the current sharing setting.

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

`useShareFile` and `useShareFiles` in `appShell/sharing` own source preparation, panel admission,
busy state and localized feedback. The low-level functions here only perform delivery.
`useSaveImageToPhotos` and `useSaveImagesToPhotos` own add-only permission guidance and copy the
supplied image bytes directly into Photos. They accept no watermark option and do not read the
sharing setting. After a system permission prompt, saving waits for the foreground event before
generating images; unmount cancels that wait. Document and HTML callers prepare separate unwatermarked
artifacts before local saving; a watermarked share preview is never reused for that save. System opening reuses
`prepareFileExport`.

Shared/system-open copies remain in the OS-managed cache because recipients may read after the
chooser closes. Shared copies use one path per entry revision and watermark treatment, so sharing
the same file again reuses its copy instead of adding another. A preparation failure fails delivery rather than sending a differently treated
original. Sheet dismissal does not establish recipient delivery.

Native rendering, Photos saving and recipient delivery still require device acceptance.

`prepareSharedFile` also accepts an already-finalized temporary ExportFile. It makes the same stable
OS-cache copy without applying another watermark or creating a managed entry. Document image saving
uses that copy before Photos starts, so the source request can be disposed safely. Raw temporary
paths use SHA-256 identities; managed files keep their entry/revision cache keys.

For a managed bitmap, `prepareFileExport` restores any established AI metadata after brand
composition through the injected `FileModule.completeExportFile`. A managed source reference also
preserves labels in historical files whose database source facts are absent. Failure removes the disposable
derivative before delivery; the managed source remains intact. Existing byte-copy paths retain
metadata without a new outbound inspection gate. Temporary descriptors and shared copies retain
the source facts; cache identities include their metadata version.

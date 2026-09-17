# Image Export

Owns the export-only image signature shared by document capture, painting actions and file viewers.
`useExportSignature` supplies the original Cherry artwork, fixed white/black color tokens and
brand name. `shared/utils/exportSignature.ts` owns the layout and time format.
The full-width footer groups the logo and Cherry Studio name on the left, with local export time
aligned to the right and 16-point horizontal padding. Its 360-point reference layout has a
56-point minimum height; dimensions scale with image width and text can increase the height.

`prepareImageExport` appends the footer to a disposable PNG without resizing or overwriting the
managed source. It uses the installed Skia CPU renderer with system-font paragraphs and releases
native allocations after encoding. Photo saves release the temporary PNG once Photos has copied it.
`prepareFileExport` also supplies the PNG filename and media type for sharing and system opening;
non-image files pass through. Shared/system-open copies remain in the OS-managed cache because
recipients may read them after the chooser closes. A signature failure fails the export rather
than delivering an unmarked original.

Document PNGs already include the same footer during HTML capture. Their `document-export`
provenance prevents another decode or a duplicate footer on later delivery. Existing document
exports are treated as completed artifacts; this does not retrofit their previous footer designs.
The document pipeline retains its single capture without decoding and re-encoding the long image.

All image export actions use this brand signature, including images accessed through the file viewer.
No additional AI-generated wording is added. The application preview and managed image used for
further editing retain their original bytes. Native rendering, photo saving and recipient delivery
still require device acceptance.

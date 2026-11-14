# Caller-selected sample data

Use the initiating user's dedicated dataset. These samples are optional, newly authored,
self-contained data; no device import or viewer validation has been performed. Ask which sample
source to use. Do not replace existing data or assume a host file is available on the device.

## Bundled Optional Samples

| Format | Sample | Recognizable content |
| --- | --- | --- |
| TXT | [sample.txt](./sample.txt) | TEXT START, numbered lines and TEXT END |
| JSON | [sample.json](./sample.json) | JSON START, numbered items and JSON END |
| XML | [sample.xml](./sample.xml) | XML START, numbered items and XML END |
| YAML | [sample.yaml](./sample.yaml) | YAML START, numbered items and YAML END |
| Markdown | [sample.md](./sample.md) | A heading, table, code block and MARKDOWN END |
| HTML | [sample.html](./sample.html) | Rendered heading/sections and HTML END; no script or network resource |
| SVG | [sample.svg](./sample.svg) | Red circle, blue square and CHERRY SAMPLE label |
| RTF | [sample.rtf](./sample.rtf) | Bold RTF START/END and numbered paragraphs |

Scroll to the later marker when the case requires scrolling. The labels use a common
`CHERRY ACCEPTANCE` prefix except the SVG label. Keep the sample's actual format/MIME association
when importing through an approved workflow; a converted file does not prove the original viewer.

## Inputs Supplied By The Caller

These formats and other test inputs are deliberately not synthesized from private data or downloaded.
Their absence from this directory is a data prerequisite, not a reason to remove their catalog cases.

| Input | Minimum useful sample |
| --- | --- |
| JPEG, PNG, WebP | A small recognizable image; use a static image for crop/rotate checks |
| GIF | A recognizable GIF, with an animation if animation behavior is to be observed |
| PDF | A known-good document with at least two distinguishable pages |
| DOCX | A known-good document with recognizable text and enough content to scroll |
| XLSX | At least two named worksheets with known cell values |
| PPTX | At least two distinguishable slides |
| DOC, XLS, PPT, ODT, ODS, ODP | Known-good files for exposed platform-viewer paths, plus an available compatible viewer |
| Template/reference photo | An approved image appropriate for the chosen template or editing model |
| Profile avatar | An approved image and a way to restore the previous avatar |
| Chat/model setup | A dedicated in-app Agent, usable text model(s), and document-compatible model for attachment sending |
| Image model setup | Approved generation/editing capabilities and allowance for the selected calls |
| Provider settings | A dedicated reversible configuration and a valid model definition for the add-model case |
| Assistant-produced file | An accessible existing file or one produced by an explicitly requested action |

For each selected format, record the chosen file, recognizable marker, actual MIME type and
device-accessible location in the run report. Keep results independent per format. Missing data,
model capability or external viewer is `incomplete`, not a pass or automatic product failure.

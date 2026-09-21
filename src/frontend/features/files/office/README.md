# Office Preview

`FileOfficeViewer` is the route-owned Office viewer for DOCX, XLSX and PPTX. iPhone, iPad and Android enter
through the same `useOpenFileEntry` route. Quick Look supplies iOS file thumbnails; full Quick Look
is available only through explicit system opening or for unsupported formats. Library list and file-picker
rows request thumbnails too, retaining their single row-owned press/selection target.
The native header owns back/share/open-with, `OfficeToolbar` owns page/zoom/sheet controls, and
`DocxPreviewDom`, `PptxPreviewDom` and `XlsxPreviewDom` are separate Expo DOM boundaries for browser rendering. Native code must not import a
`browser/` implementation directly.

## Desktop Source

The read-only source was Cherry Desktop `e131f495a9af593ec873bea34b935e97d644f586` (2.0.12).
[desktop-source.json](desktop-source.json) records each copied file and its source SHA-256.
DOCX and PPTX integration follows Desktop's `WordFilePreview.tsx` and
`PowerPointFilePreview.tsx` at that commit; the mobile React wrappers replace Electron file reads,
desktop controls, and desktop error UI. The PPTX engine is ahead of that commit's `1.2.2` pin:
`1.3.0` keeps the integration API and improves CJK text, tables, 2D charts and connector markers, so
slides can render differently from Desktop 2.0.12.

| Format | Admitted implementation | Compatibility boundary |
| --- | --- | --- |
| DOCX | `docx-preview@0.3.7`, original bytes and Desktop options | Browser pagination/font availability can differ from Word; HTML alt chunks disabled |
| PPTX | `@aiden0z/pptx-renderer@1.3.0`, lazy media/slides/windowed viewer | Uses the pinned engine's supported shapes/charts; embedded PDF conversion disabled as on Desktop |
| XLSX | ExcelJS 4.4.0, Desktop parser, virtual grid, formula helpers, ECharts | Supported charts: bar/line/pie/area; other charts get a visible placeholder; formulas without a supported evaluation show their formula |

This is not an AnyDoc reconstruction and does not add legacy DOC/XLS/PPT support. AnyDoc's existing
attachment parsing and data contracts are untouched. No migration or derived file entry is needed;
sharing always exports original bytes.

## Mobile Adaptations

- Native read-only, sequential 192 KiB chunks replace Electron filesystem access. Source bounds are
  25 MiB for DOCX/PPTX and 20 MiB for XLSX. Every handle closes on success/failure; a changed file or
  disposed viewer cannot continue reading. Native errors and a 60-second deadline unmount the DOM
  document and expose retry without navigating to another application.
- Each DOM entry selects `react-native-webview` explicitly, disables the Expo native-module bridge,
  blocks document network requests and navigation, and accepts embedded images/fonts. Local access
  exists for the trusted bundled shell; on iOS its read scope is `Paths.bundle/www.bundle`, including
  sibling scripts and styles. The repository does not install `expo-updates`; adding it requires
  admitting its asset directory explicitly. Source documents only cross bounded reader callbacks.
- Browser entry bundles are separated by format, and each entry is one static bundle: no Web
  Worker, no dynamic `import()`, no async Metro chunks. Installed builds use bundled scripts with
  no CDN or runtime download; Expo owns serving and packaging through its documented DOM component
  export, and nothing here depends on Metro runtime internals or on how `file://` pages resolve
  chunk URLs.
- XLSX parses on the WebView's own thread. The WebView is already a separate process from the
  native UI, the native loading overlay covers the document area while parsing, and leaving or
  retrying unmounts the WebView, which ends the parse. Desktop's standalone Worker is therefore not
  reproduced. Source bytes are copied before ExcelJS reads them so Strict Mode/retry keep the
  original. Native action proxy changes do not restart the parser; the DOM host keeps stable entry
  callbacks that call the latest native actions. This does not establish a mobile memory/performance
  budget; large workbooks within the 20 MiB bound need device acceptance.
- The spreadsheet parser and grid retain their data algorithms. Relative imports, formatting,
  caught-error causes, localized labels, and DOM-only CSS replace desktop aliases and Tailwind.
  The grid remeasures virtual sizes after zoom/layout changes. React Compiler skips the TanStack
  Virtual owner, preserving its imperative reads and existing explicit memo boundary. Immutable
  image/chart positions retain Desktop's index keys.
- React render/commit errors, uncaught browser errors and rejected promises report a terminal native
  error. A subsequent ready callback cannot clear that error. Retry remounts the whole DOM entry.
  Bounded diagnostics retain read/parse/chart/render/native/deadline phases and error causes;
  native logging deduplicates up to 25 diagnostics per attempt. Raw details stay out of product UI.
- XLSX image URLs retain all parser-admitted types, including BMP/WebP. Decode failures preserve a
  visible placeholder at the drawing anchor and set the partial-content notice. A URL creation or
  chart initialization failure releases resources allocated before the failure.
- ECharts renders without entrance animation. Object URLs and chart instances are released on
  unmount, including option/observer setup and resize failures. Hidden worksheets are omitted;
  all-hidden workbooks expose the first sheet with a partial-content notice, matching Desktop fallback.
- DOCX/PPTX reading regions expose their filename and keyboard focus. Native page/zoom actions return
  focus to the document without moving the viewport. Commands are consumed once by ID, so native
  status echoes cannot repeat a previous navigation. DOCX bookmarks scroll/focus within the document;
  HTTP/HTTPS/mailto links and PPTX external shape actions use a native-validated open action without
  navigating the WebView. Invalid schemes remain disabled; document resources cannot use these links
  to trigger background loading. Link-opening failure produces localized feedback and a diagnostic.
- DOCX fits the available width without reflowing the document; PPTX uses its native contain fit and
  smaller render batches. Native zoom controls operate at 50–200%. Spreadsheet dimensions remain
  intact with two-axis scrolling, selection overlays and keyboard navigation. A native formula row
  exposes the selected address; its detail sheet shows/copies the original formula and displayed
  value separately, identifying cached/evaluated/unevaluated results. The bridge bounds each text
  field to 32,768 characters and declares truncation. Sheet changes clear selection and close detail.
  Late image/chart status updates preserve the native-owned active sheet and zoom.
- Page/zoom controls use 48-point icon targets, stack in narrow/large-font windows, and combine in
  wide windows. Sheet tabs use a horizontal virtual list. Document paper/ink remain independent of
  app dark mode; native chrome follows the Mobile token contract. iPad and Android tablets use the
  same measured-width toolbar and browser viewport resizing; iPad split windows follow their actual
  available width. Cell details use CherryUI's scrollable, width-bounded sheet.

The parser still has Desktop's declared ZIP limits (4,000 entries, 64 MiB per entry, 256 MiB total),
200,000-row/500-column layout limits and formula time budget. Metadata checks do not cap actual
inflater memory for malicious ZIP metadata. Truncation/unsupported features produce a visible
partial-content notice; no mobile fidelity or performance equivalence is claimed without acceptance.

## Audit And Validation

The selected Desktop `dependencies` audit reported unbaselined dependency/patch drift with no failed
invariants. Its source hash was
`8f6b304d43915d5194a5c98aa93bfc0f2448b74c5ae19185be5057dcb5617db0`. This feature imports the current
file-preview consumer closure only; unrelated dependency changes and desktop owner layers remain
excluded. `desktop-sync-manifest.json` is not advanced.

Focused formatting/lint is the authorized local check. Routing, bounded reads, cell details, image resource lifetime and late render/effect failures have
regression cases. Additional cases cover document links/bookmarks, all-hidden fallback and bounded
diagnostics.
Desktop ZIP/parser/formula/number-format/theme/geometry/chart cases and generated
OOXML fixtures are copied with their original source hashes; Jest replaces Vitest and test helper
filenames follow the repository convention. Date formulas, hostile axis offsets, chart ranges,
floating-object caps and chart XML edge cases are included. Grid DOM selection/merge/image/chart-host
cases and ECharts sizing/disposal cases use Jest's jsdom environment and Testing Library; jsdom does
not measure real layout or render a Canvas. These test dependencies were installed with lifecycle
scripts disabled and the peer graph deduplicated. Type checks and the focused Jest suites above pass locally; platform exports/builds and device
acceptance have not been run. Acceptance must include an installed offline development build, Android phone/tablet,
iPhone and iPad unified preview in full/split windows plus Quick Look thumbnail fallback, both themes, large fonts, malformed/encrypted/large files,
back/retry during parsing, external relationships, and visual comparison with the pinned Desktop
source. See [File Preview And Viewer](../../../../../docs/references/file-preview-and-viewer.md).

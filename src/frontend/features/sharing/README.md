# Sharing Page

`/share` presents the shared CherryUI BottomSheet for documents, original files, image groups and
HTML conversion. The preview-led sheet has no title row. A floating icon-and-label Tabs control
switches applicable formats over the preview; images alone have no format control. Progressive blur
and a translucent gradient keep the floating controls readable while content extends underneath.
The sheet measures the controls and supplies preview-only bottom clearance (at least 96 points),
so scrolling can lift the document footer above them without adding space to exported files. The fixed
footer pairs a tonal, labeled Save action with the primary Share action, using Button's `footer`
size for Android's compact labels and minimum 48-point touch targets. Watermark selection stays
in global settings, and the source still owns the selection.

The native transparent modal route owns local Alert and BottomSheet providers, so permission
guidance and the sheet present from that route's controller hierarchy. The design's 393×852 reference uses a 748-point document panel
and a 552-point file/media panel, clamped by BottomSheet to the window's available safe area.

## Preview

CherryUI `CardStack` presents upright, flat neighboring cards with page dots. Native horizontal
fling recognition and accessible page adjustments change the current item; vertical movement yields
to the sheet. Fixed slots preserve the foreground document browser across page changes, and only
the current document page mounts a browser. Large collections window the visible dots while their
accessible label retains the complete page count. The default `fill` layout lets a single item use
its available frame without a pagination row. Media uses unchanged images with contain fitting;
other files reuse the file library's type icons and filename on the same preview surface.

Documents show a loading state until asset-bearing HTML is ready, then mount the preview browser
with that document. Each format change and retry owns its preparation, page plan and failure;
callbacks from an obsolete preview cannot update the current preview. PNGs are captured only on
Share or Save. The preview card has 16-point side and 10-point top insets. HTML shows filename,
message count and byte size above the rendered webpage; Markdown shows the same file identity
above the actual raw text, without a second HTML parse. Long labels can scroll in the floating
format control; its glass material is owned by the iOS Tabs adapter, with a complete shared fallback.

Message images are 360 logical points wide and always use 3x output. Their complete author/content/
footer layout is limited to 3600 points (1080×10800 output pixels). After fonts and images settle,
preview and capture run the same block-aware truncation: paragraphs and list items clamp by lines,
code keeps complete lines, tables keep complete rows, and indivisible content is dropped. A quiet
ellipsis ends retained content; no orphan heading, extra overflow budget or body fade remains.
The inset footer uses theme-appropriate official artwork and a complete QR. HTML/Markdown keep the
full snapshot. Local saves use the same rendering rules without a sharing watermark.

Viewport-sized captures are joined into one PNG. A single tile reuses its bytes without another
bitmap/encode pass. Generic document images retain full pagination: at most 480 content points plus
16 top spacing per page, 3x density and 64 pages. Indivisible objects or page limits fail explicitly.

Format changes cancel obsolete work and wait for its physical completion. Failure keeps the chosen
format with a retry; it never silently changes image output to HTML or Markdown. Theme and watermark
are held stable during document delivery. Repeated formats reuse session artifacts, parsed HTML and
source-keyed assets; cache retention is bounded.

## Files and HTML

Original files share as independent files in frozen source order. File-library requests show no
format control or watermark switch, including all-HTML selections; original bitmap sharing still
follows the global watermark setting. Other all-HTML requests with conversion enabled offer
Original, Image and PPT in the same floating Tabs control. Authored HTML keeps its
existing desktop capture strategy. PPT previews
reuse the captured page images and delivery sends PPTX files. Conversions remain temporary and are
reused within the request. Only explicit Save persists them. A failed member prevents partial
multi-file delivery.

## Delivery and cleanup

Share sends temporary artifacts through `appShell/fileExport` without saving to the file library.
Document image Save writes all pages to Photos after copying them into the stable delivery cache;
HTML/Markdown and PPT Save explicitly persist into the library; converted HTML images save to Photos.
All local saves use unwatermarked artifacts even when the share preview has a watermark. Document
and HTML conversions prepare a separate clean artifact instead of reusing the signed preview.
Original image groups can save their unchanged bytes to Photos. Permission handling stays in the
existing file-export owner.

The request retains in-flight generation and copying before disposal. Each native captured page is
copied and released before the next; the shared HtmlCapture executor owns the physical lease.
Request closure cleans temporary conversion artifacts and document sessions, while OS-managed
sharing copies remain available to delayed readers. Builds, tests and device acceptance require
separate user authorization; no runtime performance measurements are claimed here.

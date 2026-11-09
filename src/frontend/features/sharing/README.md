# Sharing Page

`/share` presents the shared CherryUI BottomSheet for documents, original files, image groups and
HTML conversion. The title is Share, supported formats live in a compact menu, and the fixed footer
contains Share plus an applicable Save action. Watermark is a menu setting. The panel does not
change selection or show a second selection workflow.
Sharing-related context menus, More menus, and format menus use a single flat list without section
separators, including their file-library, file-viewer, and painting entry points.
The native transparent modal route owns a local `BottomSheetProvider`. Its sheet stays inside that
route's controller hierarchy, allowing native format menus to present and keeping sheet controls
above the route's touch surface.

## Preview

CherryUI `CardStack` holds three fixed preview slots with slight rotation and translation behind
the upright current card. Native horizontal flings and accessible previous/next buttons change the
current item. Vertical interaction belongs to BottomSheet. Original images use their real content;
other files use the file library's shared type icons and colors on a neutral tile. Native gesture
acceptance remains pending.
HTML, Markdown and single-card message images use `CardStack`'s `fill` layout, occupying the space
between the header and action footer with 16-point side and 8-point vertical gutters. There is no
empty pagination row for these single previews. Generic paginated images and file decks retain
their compact stacked layout.

Documents show lightweight readable content immediately, then prepare asset-bearing HTML. PNGs
are generated only on Share or Save. The current WebView stays mounted across page changes;
background paper slots do not mount additional document browsers. Message images are one card,
360 logical pixels wide, with a shared source budget of 1500 content pixels for one message or
3400 for multiple messages. Long selections explicitly show an excerpt notice; HTML and Markdown
retain the full source. The image preview scrolls at the card width instead of shrinking a long
card into unreadable text. Share preview and capture use identical content, typography and footer;
local saves render the same content without the sharing watermark.
Output density is 3x through 2000 logical pixels and 2x above that. Viewport-sized tiles are joined
into one PNG; a single tile reuses the captured bytes without another bitmap/encode pass.
Generic document images retain full pagination: at most 480 content pixels plus 16 top spacing,
3x density and 64 pages. Oversized indivisible content or page limits fail explicitly. HTML retains
its full scrollable code and Markdown retains authored fences.

Format changes cancel obsolete work and wait for its physical completion. Failure keeps the chosen
format with a retry; it never silently changes image output to HTML or Markdown. Theme and watermark
are held stable during document delivery. Repeated formats reuse session artifacts, parsed HTML and
source-keyed assets; cache retention is bounded.

## Files and HTML

Original files share as independent files in frozen source order. File-library requests show no
conversion or watermark menu, including all-HTML selections; original bitmap sharing still follows
the global watermark setting. Other
all-HTML requests with conversion enabled offer Original, Image and PPT. Authored HTML keeps its
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

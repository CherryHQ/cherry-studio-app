# Paintings Page

This page owns `/paintings`: one immersive page for a whole painting board. The legacy
`/paintings/[paintingId]` and `/paintings/[paintingId]/conversation` routes, which released builds
linked from task notifications and the image viewer, redirect here with the same painting focused.

## Boards

A board is the long-lived canvas that threads generations together. Each generation is a
`painting` row belonging to one board; the board itself only stores its title and the node the user
last focused. Edges are derived, never stored: within a board, a painting whose input file is
another painting's output was made from it, and an input no painting on the board produced is an
"imported" node. `utils/paintingBoardGraph.ts` builds that graph and its left-to-right layout.

Every entry opens a board. A gallery card passes `boardId` and the board reopens on the node the
user last focused; a generated image in the file library or a task notification passes `paintingId`
(and `fileEntryId` for one of several images) and focuses that image. The gallery composer and a
used template start their first generation themselves and then open the new board by its
`paintingId`; `/paintings` without parameters is an empty board. The board is created by its first
generation, titled from the request (a template's title for template generations), and renamable
from the overview.

## One Page, Two Layers

A board opened from the gallery lands on the canvas; opening one image (file library, notification)
lands on that image.

- **Focus** fills the screen with the focused image. A plain tap leaves the page unchanged; tapping
  a note selects it. Long press drops a positional note (or removes the one under the finger),
  pinch and double tap zoom, and a horizontal swipe moves between the images of one generation.
  The header carries back (to wherever
  the board was opened from), the board pill (to the canvas), and one ungrouped menu with save,
  share, generation info, and delete-this-version. Below the image, the lineage strip shows sources,
  the current image, and what was made from it; tapping a cell walks the edge and holding one
  previews it in place for comparison.
- **Canvas** (the overview) draws every node and edge, generations reading left to right. Each
  node is labelled with its generation number and model above the image, with a single-line prompt
  preview below it. Tap either label or preview to read the complete prompt in an anchored
  information popover. The selected image's size tag sits below the preview. Tapping a node selects
  it — an outline, corner handles, and its pixel size — and the composer edits that image; tapping
  the selected node opens it in focus;
  tapping the empty canvas clears the selection, and the composer then starts a new root. It opens
  scaled to fit (down to 60%) or around the selection; drag to pan, pinch to zoom, double tap to
  return to the opening view. Notes belong to focus and are only sent from there.

The composer stays mounted across both layers so a draft survives moving around the board. The
focused image is attached as the next generation's reference (`usePaintingFocusReference`); removing
it means "generate something new" until the focus moves. Model and parameters live behind the
composer's + menu, in one generation-settings sheet.

The resting composer keeps the reference as a thumbnail without a remove badge. Focusing it opens
the shared full-width editor and moves references into chat's attachment area for preview and
removal. The upper-right action enlarges the same field; the board header and canvas controls stay
hidden and inaccessible through its close transition. Sending collapses the editor through the
shared send boundary.

Image-editing ratios live in a single horizontally scrolling shortcut row above the composer, with
shape previews and ratio-only labels. They follow the composer's selected model and parameter
draft, hide when references are removed or the large editor is presented, and never send directly.
Choosing one saves any selected note and prepares a whole-image request; user-authored text stays
intact, while untouched shortcut text follows subsequent ratio choices.

Sending moves the focus to the new receipt (selected on the canvas, or full screen in focus), which shows the loader until its job finishes; the
generation runs as a durable job, so the user can keep browsing the board. Generating and stopped
receipts keep the requested image proportions. The shared loader is a text-free holo card with a
light sweeping across it; it stops when the screen is inactive, the app is backgrounded, or Reduce
Motion is enabled. A stopped generation shows an empty image frame, its saved brief, retry, and an explicit
error-details action instead of a conversation error bubble. Diagnostic messages stay in the shared
detail sheet. The receipt content scrolls above the composer when space or text size requires it.
Stopping a running generation discards its receipt. If it
was the board's last generation, the next send creates a fresh board on the same page. Removing a
version refreshes the board and moves its focus and route to a surviving generation.

## Notes

`usePaintingAnnotationDraft` keeps unsent notes per image. The composer has one field, so selecting a
note swaps the field to that note's text and selecting "whole image" swaps it back. Sending freezes
the notes into positional model instructions (`prompt`) and a human brief (`brief`); the board,
generation info, and accessibility labels show the brief. Notes guide the model through its
reference-image contract; they are not masks.

## Organization

- `PaintingScreen.tsx` resolves the route into a board and follows the app theme, including its
  background, status bar, chrome, composer, and sheets. Image badges and annotation outlines retain
  fixed contrast over uncontrolled image content.
- `components/` holds the workspace, the focus canvas and chrome, the overview and its chrome, the
  lineage strip, and the generation info sheet.
- `hooks/` holds board data, generation control, the focus reference, and annotation drafts.
- `utils/` holds the board graph, annotation prompts, and change-ratio options.

The gallery at `/drawings` lives in `src/frontend/features/drawings`. Painting queries, the board
list, starting generations, and job observation shared with it live in `src/frontend/data/paintings`.

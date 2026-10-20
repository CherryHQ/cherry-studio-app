# Drawings Page

This page owns `/drawings`, the sidebar's paintings destination, and its child route
`/drawings/templates`, the template stage.

## Home

The home is one vertical list. A compact row of bundled templates comes first; "All" or any card
opens the template stage. Every board follows, most recently touched first: the latest one full
width so it is easy to pick up again, the rest two to a row. A card shows the board's newest work as
a mosaic split in halves — two side by side; three as the newest on the left with two stacked on
the right; past three the bottom-right cell splits again and its right half shows `+n` for the rest.
A running generation holds its place with the shared loader, and receipts that stopped without
images are skipped. Below the cover sit the title and the generation count with the last-change date.
Tapping a card opens `/paintings` with its `boardId`. The composer at the bottom is the board's own
painting composer; its first send starts a new board and opens it.

Board summaries come from `GET /painting-boards` (`usePaintingBoards`), and covers from
`usePaintingBoardCards`, both in `src/frontend/data/paintings`.

## Template Stage

The stage is a transparent modal so it can grow out of the gallery. Its motion contract lives in
`templates/components/TemplateStage.tsx`: the tapped card scales up from where it sat, pulling the
card down follows the finger and, past a threshold or with a flick, shrinks it back to that place
(any other template fades away instead), and "Use template" moves the same card up to make room for
its fields. With Reduce Motion the stage appears, switches, and closes without travel. There is no
close button; the pull, Android back, and the accessibility escape gesture all dismiss it.

Templates are swiped horizontally and filtered by category. The backdrop is the current template
blurred under the page background; see [Design Spec](../../../../DESIGN.md#surfaces-and-borders).

Using a template shows each `${…}` variable of its prompt as an editable field, labelled by the
phrase that introduces it. A template may name one slot whose subject a photo can replace, or
require a photo outright; the photo is attached as the reference image and the slot's text names
the photo's subject in the prompt's language. Generating goes through the painting composer's own
submission path (`usePaintingInput`), so model, reference, and parameter checks match the board;
the new board is titled after the template and replaces the stage.

## Organization

- `components/` holds the home list, board covers, and the template strip.
- `templates/` is the stage page: its screen, stage, field panel, and generation hook.
- `hooks/usePaintingTemplates.ts` loads the bundled templates in the app language.
- `utils/paintingTemplates.ts` reads the catalog and its mobile presentation data, parses slots,
  and materializes prompts; `utils/paintingTemplateOrigin.ts` carries the tapped card's frame to
  the stage.

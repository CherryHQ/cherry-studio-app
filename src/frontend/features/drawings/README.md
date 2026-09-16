# Drawings Page

This page owns `/drawings`: the painting history grid, recent-photo entry points, bundled templates,
and multi-select deletion UI.

The header's plus action opens a new painting. Long-pressing a history tile enters selection and
selects that painting; releasing the same press does not navigate or toggle it again. While
selecting, the header's back and Done actions clear selection and restore the gallery.

Templates use the desktop's bundled bilingual catalog. Their order is shuffled once per mounted
list and survives language changes and ordinary renders. Selecting one previews its image at half
the available content width, between 160 and 320 points, with a four-line prompt excerpt that can
expand to the selectable full text. The fixed "Try it" action opens `/paintings` with the full prompt
prefilled in the existing composer. Users edit the prompt, choose a model, adjust generation settings, and add
reference photos there before sending. Template use only creates an editable draft; the bundled
prompt stays unchanged and preview images are not attached.

Page-local UI lives in `components/`, selection adaptation lives in `hooks/`, and photo-library
access lives in `utils/`. Painting data shared with the composer page comes from
`src/frontend/data/paintings`.

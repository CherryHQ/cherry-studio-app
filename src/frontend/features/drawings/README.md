# Drawings Page

This page owns `/drawings`: the painting history grid, recent-photo entry points, bundled templates,
and multi-select deletion UI.

The header's plus action opens a new painting. Long-pressing a history tile enters selection and
selects that painting; releasing the same press does not navigate or toggle it again. While
selecting, the header's back and Done actions clear selection and restore the gallery.

Templates use the desktop's bundled bilingual catalog. Their order is shuffled once per mounted
list and survives language changes and ordinary renders. Selecting one opens a large BottomSheet
with a fixed creation footer. Users select a compatible model and add reference photos when the
template requires them. A lower entry expands a single editor for this creation's complete prompt;
it starts from the template defaults and is discarded when the template closes. Templates with an
explicit aspect ratio seed the nearest supported model ratio or size. The fixed footer follows the keyboard, and
the form's shared sheet scroll view reserves clearance for its measured height.
Creation enqueues the existing painting job and opens
its receipt in `/paintings`; dismissing the form leaves the bundled template unchanged.

Page-local UI lives in `components/`, selection adaptation lives in `hooks/`, and photo-library
access lives in `utils/`. Painting data shared with the composer page comes from
`src/frontend/data/paintings`.

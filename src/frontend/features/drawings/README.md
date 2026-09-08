# Drawings Page

This page owns `/drawings`: the painting history grid, recent-photo entry points, bundled templates,
and multi-select deletion UI.

The header's plus action opens a new painting. Long-pressing a history tile enters selection and
selects that painting; releasing the same press does not navigate or toggle it again. While
selecting, the header's back and Done actions clear selection and restore the gallery.

Page-local UI lives in `components/`, selection adaptation lives in `hooks/`, and photo-library
access lives in `utils/`. Painting data shared with the composer page comes from
`src/frontend/data/paintings`.

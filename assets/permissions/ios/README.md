# iOS Permission Artwork

The bundled light PNGs have matching `*-dark.png` variants. The permission row
selects the image using the application theme, including an explicitly selected
theme that differs from the system appearance.

Dark variants were edited from the matching bundled light images with the built-in
imagegen tool, then normalized to 64 × 64 PNGs. They are project artwork derived
from the existing assets, not dynamically resolved system app icons. Keep the
calendar date, heart, navigation marker, and reminder bullets recognizable when
updating either appearance. The consuming Image owns the common rounded clipping.

# Artifact Preview

This shared component family connects an artifact preview surface to its viewer target.

## Public Interface

- `ArtifactImageViewer` renders a measured, pannable, pinch- and double-tap-zoomable image inside
  the transition target. Callers supply its accessible label and observe zoom state when navigation
  gestures must be disabled.
- `ArtifactImagePages` displays ordered image files with known dimensions at reading width.
  It shares the existing pinch/pan interaction, keeps bounded pages at original decode resolution,
  and disables the surrounding list during zoom. Large single images use a viewport-sized browser
  displaying the actual PNG, with browser-dependent decode quality.
- `ArtifactPreviewLink` accepts an Expo Router destination and marks its child as the preview
  source.
- `ArtifactPreviewTarget` marks the corresponding viewer content as the transition target.

All platforms use a normal link so the preview pressable remains the accessibility owner. Expo
Router's native Apple zoom source is intentionally not used because it flattens that pressable out
of the iOS accessibility tree.

## Ownership

Painting and drawing pages own artifact descriptors, file resolution, viewer routes, chrome, and
capability actions such as edit, download, or retry. This family owns the transition and zoom contracts shared by those pages.
Application-level sharing and save-to-Photos actions belong to `appShell/fileExport`. Image load failures are reported through the optional `onError`
callback so the page owns its retry and fallback.

## Organization

- `components/ArtifactImageViewer/` contains the shared full-screen image interaction.
- `components/ArtifactPreviewTransition/` contains the private platform family behind `index.ts`.

Document export and the file viewer consume `ArtifactImagePages`. Exported PNG files are identified
by their persisted provenance; the file viewer reads only their 24-byte header before choosing the
reader. Bounded pages fit available width without initially upscaling beyond their source pixels.
The original-resolution native decode budget is 6 million pixels; this selects a viewing path and
does not restrict export. Single images above it never enter a full-height native Image drawable.
The browser path is not a region decoder and cannot promise full detail at arbitrary dimensions.

Vertical scrolling belongs to the page list at rest. Pinch/double-tap zoom enables the existing
image pan and disables list scrolling until reset; file navigation observes the same zoom state.
System edges remain platform-owned. New gesture and rendering behavior still needs device acceptance.

# Artifact Preview

This shared component family connects an artifact preview surface to its viewer target.

## Public Interface

- `ArtifactImageViewer` renders a measured, pannable, pinch- and double-tap-zoomable image inside
  the transition target. Callers supply its accessible label and observe zoom state when navigation
  gestures must be disabled.
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

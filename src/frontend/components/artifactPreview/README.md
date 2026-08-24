# Artifact Preview

This module owns the app-level navigation gateway that connects an artifact preview surface to its
viewer target.

## Public Interface

- `ArtifactImageViewer` renders a measured, pannable, pinch- and double-tap-zoomable image inside
  the transition target. Callers supply its accessible label and observe zoom state when navigation
  gestures must be disabled.
- `ArtifactPreviewLink` accepts an Expo Router destination and marks its child as the preview
  source.
- `ArtifactPreviewTarget` marks the corresponding viewer content as the transition target.

On iOS the gateway uses the native Apple zoom transition. Android and fallback platforms retain
the same navigation contract with a normal link.

## Ownership

Callers own artifact descriptors, file resolution, viewer routes, chrome, and capability actions
such as edit, download, or retry. This module does not parse tool results or depend on a feature
domain.

## Organization

- `components/ArtifactImageViewer/` contains the shared full-screen image interaction.
- `components/ArtifactPreviewTransition/` contains the private platform family behind `index.ts`.

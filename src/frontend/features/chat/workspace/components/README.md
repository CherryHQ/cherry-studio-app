# Chat Workspace Components

## Session Switch Behavior

When the active Session changes, `ChatWorkspace` gives the shared `MessageList` a new dataset key
and shows `ChatInitialRenderCover` with a centered loading indicator over the message list area. The
cover does not block touches and does not cover the floating input. A newly created Session whose
first active turn is supplied by the observation snapshot skips this cover and renders that
exchange immediately.

The new list renders behind the cover, waits for history readiness, and restores either its saved
semantic row anchor or the live edge. After that operation settles and the list reports ready, the
cover and loading indicator exit together with a short eased fade.

Viewport following, scroll memory, keyboard spacing, manual scrolling, and the scroll-to-bottom
control are owned and documented by `@/frontend/components/messages`.

# Chat Workspace Components

## Session Switch Behavior

When the active Session changes, `ChatWorkspace` remounts the shared `MessageList` with a new render
key and shows `ChatInitialRenderCover` with a centered loading indicator over the message list area.
The cover does not block touches and does not cover the floating input. A newly created Session
whose first active turn is supplied by the observation snapshot skips this cover and renders that
exchange immediately.

The new list renders and measures behind the cover first. After the list reports ready, the cover and loading indicator exit together with a short eased fade.

List anchoring, keyboard spacing, entry animation, manual scrolling, and the scroll-to-bottom
control are owned and documented by `@/frontend/components/messages`.

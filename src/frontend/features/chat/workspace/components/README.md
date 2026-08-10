# Chat Workspace Components

## Topic Switch Behavior

When the active topic changes, `ChatWorkspace` remounts the shared `MessageList` with a new render
key and shows `ChatInitialRenderCover` with a centered loading indicator over the message list area.
The cover does not block touches and does not cover the floating input.

The new list renders and measures behind the cover first. After the list reports ready, the cover and loading indicator exit together with a short eased fade.

List anchoring, keyboard spacing, entry animation, and tail following are owned and documented by
`@/frontend/components/messagePresentation`.

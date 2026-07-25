# Chat Workspace Components

## Topic Switch Behavior

When the active topic changes, `ChatWorkspace` remounts `ChatMessageList` with a new render key and shows `ChatInitialRenderCover` with a centered loading indicator over the message list area. The cover does not block touches and does not cover the floating input.

The new list renders and measures behind the cover first. After the list reports ready, the cover and loading indicator exit together with a short eased fade.

## Short Conversations

If the measured message content height fits above the floating input, the list does not call `scrollToEnd`.

The content stays at the top with the normal top padding. This keeps short topics from being bottom-pinned or hidden under the transparent header.

## Long Conversations

If the measured message content height is taller than the visible area above the floating input, the list adds bottom padding equal to the floating input inset.

Before removing the cover, the list calls `scrollToEnd({ animated: false })`. The user sees the topic already positioned at the latest message, without a visible scroll animation.

## Later Message Updates

`maintainScrollAtEnd` only listens to `dataChange`. If the user is already near the bottom, new messages keep the list at the bottom without animation.

Layout and item-layout changes do not force the list back to the bottom. This lets the user scroll upward without being pulled back by measurement updates.

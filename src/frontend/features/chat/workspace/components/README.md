# Chat Workspace Components

## Topic Switch Behavior

When the active topic changes, `ChatWorkspace` remounts `ChatMessageList` with a new render key and shows `ChatInitialRenderCover` with a centered loading indicator over the message list area. The cover does not block touches and does not cover the floating input.

The new list renders and measures behind the cover first. After the list reports ready, the cover and loading indicator exit together with a short eased fade.

## Composer Inset

The floating composer reports its measured height through `useKeyboardChatComposerInset`. The list waits for its first non-zero viewport layout before attaching that shared inset; this avoids sending an invalid animated scroll-indicator inset while a navigation transition still has the list at `0x0`.

`KeyboardAwareLegendList` then owns composer spacing and keyboard lift. The content container keeps only the fixed visual gap below the final message.

## Live Turn Anchoring

The latest user message is anchored below the header. `anchoredEndSpace` reserves the remaining viewport while the assistant reply is short, then reports when that space is exhausted.

Text anchors use a two-line height cap. Messages containing files use their complete measured height.

## Tail Following

After the reserved space is exhausted, data and item-size changes schedule one non-animated native `scrollToEnd` per frame. The callback rechecks the current phase and the synchronous interaction lock immediately before dispatching.

Touch, drag, and momentum events cancel pending follow work and pause following. End-visibility changes are ignored while an interaction is active. Following resumes only after the list's measured distance from the end is within the 20-pixel threshold, including after the existing scroll-to-bottom button reaches the end.

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
control are owned and documented by `@/frontend/components/Message`.

## Message Usage

Settled assistant messages show total tokens and elapsed time beside their actions. The usage
button opens `MessagePart.Detail`; only that mounted detail reads the message's local usage ledger.
Messages use the backend's persisted `stats` for token totals, breakdowns, request counts, and costs,
including attributed image calls. The ledger supplies provider names and performance measurements
from language invocations matching the message's chat model and provider. First-token latency comes
from the first matching invocation; model speed divides measured output by the matching measured
generation durations. Unmeasured calls do not contribute to either side of that ratio. Image calls
have no separate speed summary and never contribute to chat model speed. The message-wide
`providerPerformance` aggregate is not used because it can combine models and modalities.
Elapsed time comes from `runtimeTiming`.
The Data API change bus refreshes both the ledger and transcript when late usage arrives; reopening
the sheet uses the normal query cache policy.
Missing measurements stay unavailable, while an image call without token fields does not erase
reported language usage. Total throughput includes tool execution and approval waits and is not
labelled as model generation speed.

The usage button uses CherryUI's release-time press action under the existing message context menu.
Scrolling, a committed long press, and system cancellation must cancel that tap; accessibility
activation opens the same detail. The maintained sheet owns scrolling and dismissal. No feature-local
gesture recognizer is added.

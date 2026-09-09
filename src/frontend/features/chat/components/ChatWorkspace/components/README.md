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

The usage summary aligns to the right of the footer, separate from the message actions on the left.
It uses plain secondary text with a middle dot between tokens and elapsed time, without a persistent
surface, border, or extra icon. Token counts use a locale-independent compact number with its unit,
such as `27k Tokens`. The entire summary remains tappable.

The detail sheet retains localized exact counts. It opens at medium height and expands through
large to full height. The model and provider remain at the top, followed by total tokens and the
input/cache and output/reasoning measurements in two columns. A neutral segmented bar shows the
relative input/output counts only when both are known and their sum is positive. Performance
measurements follow without an explanatory paragraph, and costs appear last. The message metadata
section is omitted. The groups retain their theme tokens and scalable text. Missing counts stay
unavailable and a measured zero remains visible.

Message rows do not register a long-press copy menu. Copy is an explicit assistant toolbar action.
The usage button uses CherryUI's release-time press action.
Scrolling and system cancellation must cancel that tap; accessibility
activation opens the same detail. The maintained sheet owns scrolling and dismissal. No feature-local
gesture recognizer is added.

# Chat Streaming And Rendering

> Status: as-built.

This reference describes the implemented local Agent Session stream, transcript window, live
projection, and rendering boundaries. Remote chat/sidebar now reuse the consumption boundary; see
[Service Dependencies And Ownership](../remote-access/service-ownership.md). Terms follow [Domain Language](../domain-language.md)
and [Cherry Agent Protocol](../agent/agent-protocol.md).

## Principles

- `MobileAgentHost` owns execution, normalized protocol events, and durable terminal state.
- The frontend reads persisted transcript pages through the Data API and observes only live state
  through `Backend.agent`.
- Streaming deltas stay out of React Query. They are composed over persisted rows by stable message
  id at the chat presentation boundary.
- Render components do not write SQLite or consume Pi/provider SDK event shapes.

## Host And Runtime Boundary

`MobileAgentHost` is an application-owned `AgentProtocol` implementation. For each Session it:

- allows at most one active turn;
- reserves the user message and assistant placeholder before execution;
- normalizes Runtime text, reasoning, tool, approval, error, and usage state into Agent protocol
  values;
- publishes durable facts only after their store transaction commits;
- emits ephemeral streaming deltas without persisting every token;
- finalizes the assistant message and turn before publishing terminal events.

Version 1 routes the local execution target to Pi. The Agent client branches on protocol
capabilities, never on Runtime identity. Attachment admission is capability-driven: the composer
imports managed images, while the Host revalidates authoritative metadata and resolves bounded
managed image or text input before execution.

Expo's native fetch support provides streaming responses in the tested app runtime. AI SDK
provider packages use their compatible runtime fetch and stream incrementally without a
provider-wide shared transport adapter. This stream path remains independent of the Axios-based
external-service request/response infrastructure under `src/backend/services/http`; neither
transport is a global replacement for the other.

## Frontend Observation Boundary

The chat page's `ChatProvider` (`frontend/features/chat/runtime`) owns the local
`AgentSessionChatClient`. `useLocalConversation` subscribes to the client for the route's Session
and projects that state into the shared Conversation snapshot through `useSyncExternalStore`; the
app-shell `ConversationProvider` owns only the catalog sources. The client:

- installs the atomic `observeSession` snapshot before applying events queued during observation;
- applies `part.add`, `text.append`, and `part.replace` deltas to the live message projection;
- exposes active-turn status, pending approvals, and the entering user-message id through narrow
  selectors;
- releases the Host observation when the final React subscriber leaves;
- replaces observed Session state from a fresh snapshot when the app returns to the foreground.

Selecting an Agent opens an isolated Draft composer and does not create a Session. The first send
calls `startSession`: the Host completes write-free turn preparation, then atomically creates the
Session and reserves its first user/assistant message pair. Only after that succeeds does the client
install an observation snapshot and replace the Draft route with the durable Session route. The
snapshot hands the first user/assistant pair directly to the message list, so the initial history
query does not put a loading cover between send and streaming output.

## Transcript Window And Live Projection

The message list receives a chronological presentation sequence from two sources:

1. `/agent-sessions/:sessionId/messages`, a newest-first cursor API whose pages are reversed into a
   chronological transcript window.
2. The live Agent snapshot/events, which contain the active user/assistant rows, deltas, and
   approvals needed before the next persisted read settles.

`localConversationView` maps protocol parts and statuses into `ConversationMessage` values using
`agentMessageProjection`. `useAgentMessageHistoryWindow` owns the Session-keyed infinite query,
older/newer pagination and its Query cache lifetime, so leaving and re-entering the chat shows the
loaded pages again. `useLocalConversation` merges that history with live rows by message id and
hands each persisted page back to the client, which drops live copies once they are persisted.
Older search windows exclude live rows until their newer edge reaches the current transcript. The
renderer receives presentation values rather than protocol DTOs.

When a message is created or finalized, the frontend invalidates the transcript query in place.
When a turn reaches a terminal status, it also invalidates Session list/detail queries. Stable
message ids keep query refreshes from creating duplicate rows. The desktop route has a different
problem, a history revision that lags the live stream, and keeps its own revisioned window and
presenter under `frontend/appShell/conversation/remote` and `features/chat/remote`.

## Approval And Cancellation

Pending approvals come from the client's live Session snapshot/events. The local projection
exposes each one as an interaction with an inline input and a bound response action; that action
revalidates the approval, turn and input identity before calling the local protocol.
`ConversationApprovals` renders the same interaction shape for both sources. A terminal turn clears
pending approvals. Explicit stop reaches the Session's cancellation action; the local composer
calls the client directly for the same operation.

## Persistence And Recovery

- Streaming deltas are ephemeral; a fresh observer receives the accumulated streaming message in
  its snapshot.
- The mobile UI releases Session observations while backgrounded. On foreground it restores each
  visible Session from a fresh Host snapshot before consuming new events.
- Terminal messages, parts, errors, and usage are durable transcript facts.
- Route unmount removes the observation but does not cancel a Host-owned turn.
- On process start, unfinished local turns reconcile to `interrupted`; Version 1 does not resume
  execution.
- Background execution is not guaranteed across OS suspension or process termination.

## Rendering

- Text and reasoning remain Markdown-capable shared message parts.
- Expanded reasoning renders one continuous, selectable Markdown document. It is not truncated or
  split by character count: code fences, formulas, links, and other Markdown constructs retain
  their complete source. Like answer text, streaming reasoning holds its last rendered content
  while the list end is off screen, then catches up when the end is visible or the part finishes.
- Each text or reasoning part leaves native streaming mode when its own state reaches `done`,
  even if the turn continues with tools or another part. Turn completion, cancellation, and failure
  also end streaming mode. This releases pending Markdown tail blocks and finalizes layout without
  remounting a renderer that has streamed.
- Tool and approval state remains structured and uses the shared tool renderer and approval sheet.
- File-tool input appears inline in the message list while it is generated. `write_file` previews
  `content`; `edit_file` previews `new_string`. The tool's complete input remains authoritative for
  execution and saving.
- Before preview coalescing, Pi parses each growing tool-argument prefix. The Pi AI patch lets
  native `JSON.parse` close incomplete string values in root objects, avoiding JavaScript escape
  repair and partial-parser scans for the common file-content path. Other shapes and malformed
  input retain the existing fallback parser; complete arguments keep their original values.
- Opted-in tool previews are coalesced in Pi at 150 ms, bounded to the latest 8,192 UTF-16 code
  units and 60 lines, and emitted as `tool.input.preview`. The Host retains the bounded preview in
  its snapshot; preview events do not request transcript persistence or background-reply updates.
- The chat client routes preview events to the matching content subscriber without replacing the
  live message/list projection. Final input and interrupted snapshots supply the settled preview.
  The inline region has a maximum height; large previews identify their content as the latest
  generated portion. The full output remains in the managed file.
- Code previews use CherryUI's existing native Markdown renderer. Their code fence stays open
  during generation so native progressive mode defers highlighting until input completes.
- File-input generation uses static tool titles because the adjacent content already shows live
  progress. This avoids a continuous masked-gradient animation beside the updating preview;
  actual tool execution retains the running title animation.
- File and error protocol parts map to the existing focused renderers.
- User and assistant messages use the same `MessageList` surfaces as persisted history; system
  messages are omitted from the visible conversation list.

## Current Non-Goals

- Attachment submission while the Host capability is false.
- Follow-up queues, steering, autonomous turns, or more than one execution per turn.
- A general-purpose token store or per-token SQLite checkpoint scheduler.
- Background continuation or recoverable stream resume.

## Acceptance

- A Draft creates its Session and first message pair atomically; failed admission leaves no Session.
- The first observation snapshot recovers output produced between Session start and route subscription.
- A fresh subscriber recovers active output and approvals from the Session snapshot.
- Persisted and live rows merge without duplicate message ids.
- Older transcript pages appear in chronological order.
- The same Session cannot start a second active turn; different Sessions may run concurrently.
- Route unmount does not cancel a turn, and foreground refresh replaces stale live state.
- Text, reasoning, tool, approval, error, and terminal status parts render through shared chat
  surfaces.

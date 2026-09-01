# Chat Streaming And Rendering

> Status: as-built.

This reference defines Cherry Studio Mobile's Agent Session stream, transcript window, live
projection, and message rendering boundaries. Terms follow [Domain Language](../domain-language.md)
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

`ChatProvider` owns one `AgentSessionChatClient` for the route. React consumers subscribe by
Session id through `useSyncExternalStore`. The client:

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

The window owns older-message pagination and local reveal policy. `mergeAgentMessageViews` replaces
persisted rows with live rows of the same id and appends new live rows. `agentMessageProjection`
then maps protocol parts and statuses into the existing `MessageList` renderer shape.

When a message is created or finalized, the frontend invalidates the transcript query. When a turn
reaches a terminal status, it also invalidates Session list/detail queries. Stable message ids keep
query refreshes from creating duplicate rows.

## Approval And Cancellation

Pending approvals come from the live Session snapshot/events. The approval sheet sends an
approve/deny decision with the protocol approval and turn identity. A terminal turn clears pending
approvals. Stop calls `cancelTurn` only when the selected Session has a non-terminal active turn.

## Persistence And Recovery

- Streaming deltas are ephemeral; a fresh observer receives the accumulated streaming message in
  its snapshot.
- Terminal messages, parts, errors, and usage are durable transcript facts.
- Route unmount removes the observation but does not cancel a Host-owned turn.
- On process start, unfinished local turns reconcile to `interrupted`; Version 1 does not resume
  execution.
- Background execution is not guaranteed across OS suspension or process termination.

## Rendering

- Text and reasoning remain Markdown-capable shared message parts.
- Tool and approval state remains structured and uses the shared tool renderer and approval sheet.
- File and error protocol parts map to the existing focused renderers.
- User and assistant messages use the same `MessageList` surfaces as persisted history; system
  messages are omitted from the visible conversation list.

## Current Non-Goals

- Attachment submission while the Host capability is false.
- Follow-up queues, steering, autonomous turns, or more than one execution per turn.
- A separate token throttle store or per-token SQLite checkpoint scheduler.
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

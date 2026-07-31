# Chat Streaming And Rendering

This reference defines Cherry Studio Mobile's AI SDK stream, backend `ChatSession` overlay, Message
History Window, and Markdown/LaTeX rendering boundaries. Terms follow
[Domain Language](../domain-language.md).

## Principles

- AI SDK continues to own provider requests and provider-specific stream parsing.
- `ChatSession` consumes AI SDK UI message chunks and converts them into Cherry Message overlay
  snapshots.
- Message History Window remains database-backed and static: it exposes persisted active-branch Messages from SQLite through React Query pagination.
- Active assistant output is composed through an in-memory Streaming Message Overlay instead of mutating the Message History Window for every token.
- Render components do not write SQLite directly. Terminal persistence belongs to the runtime owner.

## Current Stream Boundary

- `AiService.streamText()` requires `requestOptions.signal`.
- `AiService` resolves provider/model/assistant parameters and constructs an AI SDK `Agent`.
- `Agent.stream()` calls the AI SDK stream API and returns a `ReadableStream<UIMessageChunk>`.
- `ChatSessionImpl` reads that stream with `readUIMessageStream<CherryUIMessage>()`.
- Cherry Mobile does not parse provider-specific SSE in the chat runtime.
- Provider configs rely on the Expo/React Native runtime fetch behavior used by AI SDK provider packages.
- CherryAI signing is a provider-specific fetch wrapper and calls runtime `fetch` after adding signature headers.

## Fetch Transport Decision

Expo's native fetch support now provides streaming responses in the tested app runtime. The current code streams incrementally without a shared transport adapter, so the architecture does not require injecting `expo/fetch`, Nitro fetch, or another provider-wide transport wrapper.

## Chat Session Boundary

The backend `ChatSession` owns:

- Active request state.
- AbortController.
- Assistant placeholder id.
- Topic snapshots with the current Streaming Message Overlay.
- Terminal assistant Message persistence.
- User abort and session-disposal abort.

The backend `ChatSession` does not own:

- Markdown component trees.
- Provider/model catalog refresh.
- Full history prefetch.
- UI scroll position.
- App background continuation, checkpoint, pause, or recoverable resume.

## Message Window And Streaming Overlay

The chat list receives a presentation sequence built from two sources:

1. The Message History Window, which reads persisted active-branch Messages from SQLite.
2. The Streaming Message Overlay, which provides the current in-memory assistant Message while generation is active.

The Message History Window owns older-message loading, prefetch, and reveal policy. It should not receive every token delta. The overlay owns active output identity and temporary content until the assistant turn is complete.

Current flow:

1. Persist the user Message and a stable assistant placeholder before streaming starts.
2. Set the assistant placeholder as the active overlay Message.
3. Build the active history path and call the injected AI dependency's `streamText()`.
4. Read AI SDK UI message chunks with `readUIMessageStream()`.
5. Apply each UI message to the assistant placeholder and publish a new overlay snapshot.
6. Persist terminal `data.parts` and `status` when the stream succeeds.
7. Persist partial parts with status `paused` on user abort, or append `data-error` and mark status `error` on failure.
8. Invalidate the relevant messages query so the persisted Message takes over from the overlay.

The assistant placeholder id must remain stable for the whole run so the list does not treat each stream delta as a new item.

## Persistence And Checkpointing

Current persistence is terminal-save oriented:

- The user Message and assistant placeholder are written before streaming.
- Overlay deltas are in memory and are not written for every token.
- Successful terminal output updates `data.parts` and `status`.
- Abort persists partial parts with status `paused`.
- Failure appends a `data-error` part and sets status `error`.
- The assistant placeholder receives its `modelSnapshot` before streaming; terminal persistence does not currently add usage, cost, timing stats, or richer trace metadata.
- If the app is backgrounded, suspended, or killed during an active stream, Cherry Mobile does not promise that in-memory overlay deltas are saved or that a pending assistant placeholder is finalized.

There is no 30-60 ms UI throttle store, 1-2 second SQLite checkpoint scheduler, or background
checkpoint policy. If those are introduced, they must stay owned by the backend `ChatSession`
because updating `message.data` also updates derived searchable text and FTS state.

## Rendering Paths

Current rendering:

- Message content is routed by Cherry Message Part type.
- `text`, `reasoning`, `data-code`, `data-compact`, and `data-translation` parts render through `PartMarkdown`.
- `PartMarkdown` uses `react-native-streamdown` with GitHub flavor and LaTeX support.
- Active assistant Markdown and stable historical assistant Markdown deliberately share the same `StreamdownText` path.
- User messages render `text` parts in plain-text mode.
- File, source, tool, step, video, and unknown parts render as dedicated placeholders or focused components.

Current non-goals:

- There is no independent Streaming Text Store.
- The app does not flatten an entire Message into one Markdown string and infer part types afterward.

## Conditional Optimizations

A Streaming Text Store or UI throttle is not part of the current architecture. Add one only after measured streaming/rendering issues, such as reproducible scroll or input jank with long Markdown responses on target devices.

If added, the owner remains the backend `ChatSession`: token-level UI cadence and SQLite persistence
cadence must stay separate because updating `message.data` also updates derived searchable text and
FTS state.

## Desktop Alignment Gaps

`message.stats` exists and follows the desktop `MessageStats` concept for token usage, cost, and timing metadata. Current mobile chat streaming does not yet extract usage or timing from the AI SDK stream into that field. Treat this as a desktop-alignment gap to fill when stream result metadata is available reliably, not as a completed persistence behavior.

## Reopen When

- Mobile adds `MessageStats` persistence.
- Mobile adds stream checkpointing.
- Measurements justify a rendering-cadence optimization.

## Acceptance

- AI SDK `streamText` produces incremental output on real iOS and Android devices instead of returning once at request completion.
- Abort stops the active stream and persists a paused assistant Message when partial parts exist.
- App background during active streaming is allowed to stop without background checkpoint or recoverable resume.
- Active responses with paragraphs, lists, code fences, tables, links, inline math, block math, and malformed math do not crash rendering.
- Scrolling and input remain responsive while streaming 10k+ Markdown characters.

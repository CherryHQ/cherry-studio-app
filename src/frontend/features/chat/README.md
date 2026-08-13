# Chat Screen

This module owns the chat topic screen, new-topic screen, chat input, runtime projection, and chat
workspace behavior. Structured message presentation is shared with painting through
`@/frontend/components/messagePresentation`.

## Public Interface

- `ChatScreen` and `NewTopicScreen` are exported from `index.ts`.

## Organization

- `input/` owns what chat wires around the shared composer: its tools, its reasoning effort, and the
  assistant/model bookkeeping behind both. The composer itself is
  `@/frontend/components/composer`, shared with painting.
- `workspace/` adapts visible Chat runtime messages into the shared `MessageList`, and owns loading
  indicators, initial-render gating, tool approvals, and composer placement. Ordinary Chat also
  owns the transient device TTS session for reply read-aloud; it is not global app state. The hook
  never detects language. For a known language it queries system voices once per session, resolves
  a concrete same-base voice, and reuses that voice for every chunk. An unknown language omits both
  language and voice so the system default is used. A missing same-base voice prevents playback and
  instructs the user to install it in system settings; the app does not bundle or download voice
  packages. The voice query obeys session-ID, stop, and lifecycle races. Playback stops when the
  Topic loses focus, the app leaves the foreground, or the active reply disappears. Preview and
  painting do not opt into actions. Read-aloud does not autoplay, persist or generate audio, or use
  a cloud or provider speech service.
- `runtime/` subscribes to the app-owned `ChatModule`, projects one Topic snapshot through
  `useChatTopic()`, and owns frontend navigation and query invalidation effects. It does not create
  or dispose `ChatRuntime`.

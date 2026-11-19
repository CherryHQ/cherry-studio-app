# Chat Send And Stream

Primary conversation workspace where the user composes prompts, attaches tools/files/skills/prompts,
queues follow-up inputs during an active turn, observes streaming replies, quotes answer excerpts,
translates messages, and responds to agent tool/user-question sheets.

## User Entry

- Default landing screen after onboarding (`testID:chat-background`, `testID:chat-composer`,
  `testID:chat-composer-send`, `testID:chat-composer-stop`).
- Composer tools menu (`testID:composer-menu`) opens `testID:chat-tools-sheet`, linking to:
  - File workspace (`testID:chat-file-workspace`), Plugins (`testID:chat-composer-plugins` -> `testID:chat-plugin-sheet`),
    Skills (`testID:chat-composer-skills` -> `testID:chat-skill-sheet`), Prompts (`testID:chat-composer-prompts` -> `testID:chat-prompt-sheet`),
    SSH (`testID:chat-composer-ssh` -> `testID:chat-ssh-sheet`).
- Reasoning effort gauge (`testID:chat-input-effort-gauge`), queued inputs (`testID:chat-input-queue`,
  `testID:chat-input-queue-toggle`, `testID:queue-take-back`, `testID:queue-detail-remove`).
- Assistant replies expose `testID:assistant-message-toolbar`, quote preview (`testID:chat-quote-preview`),
  message translation (`testID:message-translation`, `testID:message-translation-copy`, `testID:message-translation-language-menu`,
  `testID:message-translation-collapse`), and interactive question sheets (`testID:user-question-sheet`,
  `testID:user-question-previous`, `testID:user-question-next`, `testID:user-question-action`, `testID:user-question-custom`).

## Verification Driver

- Code-level streaming/state-machine regression suites:
  - `pnpm test:app -- src/frontend/features/chat/runtime/__tests__/AgentSessionChatClient.test.ts --runInBand`
  - `pnpm test:app -- src/frontend/features/chat/quotes/__tests__/useChatQuoteNavigation.test.tsx --runInBand`
- Offline deterministic Maestro streaming flow (requires dev Metro started with
  `EXPO_PUBLIC_DEV_MOCK_PROVIDER=1`):
  - `.maestro/flows/chat-mock-stream.yaml`
  - Supports `[mock:reasoning]`, `[mock:tool]`, and `[mock:error]` directives for repeatable E2E
    coverage without real API keys or network access.
- Live provider check: `agent-device` session targeting a configured workspace device with a valid
  provider (never claim a live third-party provider works based on the offline mock flow).

## Observable Acceptance

- Sending a prompt appends the user turn immediately, streams assistant text/reasoning chunks
  without flicker or dropped deltas, and settles with `testID:assistant-message-toolbar` visible.
- Cancelling mid-stream stops active generation promptly and leaves partial output intact without
  leaving stale loading indicators.
- Quoting text focuses the composer with an inline quote chip; tapping a sent quote navigates to
  the source message and briefly highlights it.

## Known Pitfalls

- No deterministic offline mock provider is installed in default seed data; never claim a live
  model call passed merely because the composer opened.
- Keyboard open/close, foldable splits, and native text selection menus interact with composer
  focus and effort overlays; verify on both iOS and Android when changing input layout.
- After Fast Refresh, SQLite `BEGIN IMMEDIATE` locks can indicate a stale dev connection—fully
  relaunch the app before investigating persistence failures.

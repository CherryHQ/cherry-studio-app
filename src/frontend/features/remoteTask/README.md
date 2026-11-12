# Remote scheduled tasks

This page owns the desktop scheduled-task catalog. The Remote sidebar opens it for the current
desktop connection. Task rows expand into paginated conversation summaries; selecting a conversation
navigates to the chat-owned read-only transcript. Returning preserves expansion and selection.

## Public interface

- `RemoteTaskListScreen` is exported from `index.ts` for the scheduled-tasks route.

## Ownership

- `RemoteTaskBoundary` retains the desktop conversation source and handles an unavailable pairing.
- Remote catalog hooks own query lifetime and refresh; collapsed or unfocused groups do not poll.
- `taskSchedule` formats supported trigger metadata. Common daily and weekly cron rules get a
  localized label; other expressions remain visible without guessing their meaning.
- Backend catalog methods project task metadata, filter ordinary conversation lists, and verify
  task membership before opening a transcript. Task writes and desktop execution stay outside this
  page.

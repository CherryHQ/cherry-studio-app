# Remote scheduled tasks

This page owns the desktop scheduled-task catalog. The Remote sidebar opens it for the current
desktop connection. Task rows expand into paginated conversation summaries; selecting a conversation
navigates to the chat-owned read-only transcript. Returning preserves expansion and selection.

## Public interface

- `RemoteTaskListScreen` is exported from `index.ts` for the scheduled-tasks route.

## Ownership

- `RemoteTaskBoundary` retains the desktop conversation source and handles an unavailable pairing.
- Task hooks consume the source's separate `tasks` query interface and own query refresh;
  collapsed or unfocused groups do not poll. The shared source still owns connection demand.
- `taskSchedule` formats supported trigger metadata. Common daily and weekly cron rules get a
  localized label; other expressions remain visible without guessing their meaning.
- Backend `RemoteTaskCatalog` owns task metadata, task-session reads and membership checks;
  ordinary conversation catalogs use its association cache to exclude task results. Task writes
  and desktop execution stay outside this page.

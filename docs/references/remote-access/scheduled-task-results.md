# Scheduled Task Result Conversations

Remote has a separate **Scheduled tasks** destination for the selected desktop. Each task is a
parent row showing its Agent and schedule. Expanding it lists the task's conversations, and selecting
one opens a read-only transcript. Returning preserves the list's expansion and selection.
Creation, editing, task controls and run-history management remain on desktop.

Desktop [PR #24299](https://github.com/CherryHQ/cherry-studio/pull/24299) provides
`agent.tasks.list` and task-scoped `agent.sessions.list({ taskId })`. Mobile consumes task IDs,
names, Agent IDs and trigger metadata, then pages conversation summaries only for expanded groups.
Daily and weekly cron rules, intervals and one-time triggers have localized labels; other cron
expressions retain their configured expression and timezone. Membership comes from the task-scoped
catalog, including all cursor pages, rather than titles or retained run records.

`RemoteTaskCatalog` owns task metadata projection, task-session reads, membership validation and
association caching. It is composed into the existing Agent scope, whose frontend-facing `tasks`
capability is read-only and retires with its caller. Frontend task queries are separate from the
conversation catalog; the shared source still owns authorization, connection demand, cursor scope
and cancellation. No separate task runtime or connection is created.

The chat route confirms task membership before opening a Session. Its read model omits send,
cancel, approval, attachment-upload and undelivered-message actions. The header has no new-chat or
Agent-picker action, and no composer is mounted. Existing history, live result rendering, readable
content, copying, speech and sharing use the shared chat components.

Task conversations are excluded from ordinary Remote catalogs using the same authoritative task
association. The backend caches this association for 30 seconds within one authorized source; an
unknown Session forces a new lookup, and reconnect clears it. Ordinary pagination skips pages
containing only task conversations. Older desktops without the Task catalog keep ordinary Session
browsing; the separate task page explains that an update is required.

Desktop-created Sessions have no catalog notification. Visible remote task and conversation lists
refresh every 15 seconds while foregrounded, and refresh when reopened or reconnected. Collapsed
groups, unfocused task pages and a closed sidebar stop their respective polling. Local catalogs
retain their event-driven behavior.

The published protocol dependency remains 0.7.0. `remoteTaskCatalogProtocol.ts` supplements only the
consumed Task-list fields and Session task filter from PR #24299. Remove this backend-only schema
supplement when the published package provides them. No task detail, run-history or mutation methods
are introduced.

The desktop owns execution, persistence and visibility. Mobile never substitutes a generated result
or bypasses desktop authorization. Mock-desktop device previews establish mobile presentation;
they do not establish execution by the actual desktop scheduler.

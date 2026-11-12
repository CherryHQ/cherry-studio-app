# Scheduled Task Result Conversations

The current mobile scope is displaying Sessions created by desktop scheduled tasks in the existing
Remote conversation list and chat page. Task lists, task details, editing and execution-history
management pages are outside this scope.

Desktop [PR #24299](https://github.com/CherryHQ/cherry-studio/pull/24299) includes readable task
conversations in `agent.sessions.list`. Mobile already consumes those summaries and opens their
messages through its existing Session/history/parts/content path. Task provenance comes from
`agent.tasks.list` followed by `agent.sessions.list({ taskId })`, including all cursor pages. It
does not depend on titles or retained run records. Matching rows display only a neutral clock;
the “Scheduled task” description remains available to screen readers. Ordinary rows keep their
existing presentation and navigation.

The backend caches this association for 30 seconds within one authorized source. An unknown Session
forces a fresh lookup immediately, so a newly discovered task result is marked on its first display.
Reconnect clears the association. Older desktops without the Task catalog keep ordinary Session
browsing; other protocol, transport and authorization failures retain their normal handling.

The current published protocol dependency is 0.7.0, which lacks these additive catalog contracts.
`remoteTaskCatalogProtocol.ts` supplies only the consumed Task-list fields and Session task filter
from desktop PR #24299. Remove this backend-only schema supplement when the published package
provides them. No task detail, run-history or mutation methods are introduced.

Desktop-created Sessions have no catalog notification. Visible remote Session lists therefore
refresh every 15 seconds while foregrounded, and refresh immediately when reopened or reconnected.
Closing the sidebar disables its remote Session query; local catalogs keep their event-driven
behavior. Rows continue to open the shared remote chat, including saved answers and attachments.

The desktop remains responsible for task execution, result persistence, visibility and readable
Session discovery. Mobile never generates a substitute result or exposes hidden desktop Sessions.

Focused regression cases cover paginated task association, fresh/reused results, metadata caching,
older desktops, Agent ownership, discovery of a newly added Session, hidden-list suspension,
reopening, and unchanged local refresh behavior. Automated tests and type checks have not been run.

An iOS simulator preview used a mock desktop speaking the Session and task-catalog protocols. Its
catalog initially contained an ordinary conversation; publishing a result while the sidebar stayed
open made the new conversation appear with its task marker on the next refresh. The ordinary row
remained unmarked. Light and dark appearances were inspected, and opening the result displayed the
saved prompt and assistant response. This verifies mobile presentation with mock data, not execution
by the actual desktop scheduler.

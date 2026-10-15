# Chat Workspace

This module owns Agent Session workspace orchestration: structurally shared runtime message
projection, older-message loading state, initial restore cover, message actions, and composer
placement. The virtualized list and message rendering live in `@/frontend/components/Message`.

## Public Interface

- `ChatWorkspace` is exported from `index.ts` for Agent Session screens. It receives the shared
  Conversation snapshot, the reconciled message rows and a history window; each source reconciles
  live rows with history before handing them over. Local chat supplies the exported
  `AssistantMessageUsage` through its `renderUsage` slot; remote chat supplies
  `RemoteAssistantMessageUsage`. Both compose the same button and detail view. Only the local
  adapter reads the mobile usage ledger; the remote adapter presents the host-owned snapshot.
- Internal workspace pieces should be imported through relative paths inside this module.
- The composer placement itself is not here — `ChatScreen` keeps the shared composer in normal
  parent flow, while CherryUI owns reusable keyboard and safe-area behavior. This module only
  connects the remaining list geometry to Chat.

## Organization

- `components/` contains loading, cover, message context menus, and the assistant action toolbar
  composed through `AssistantMessage`. `ChatScreen` mounts the composer session directly because it owns whether the
  input exists and must keep that session outside its session/empty-state branch.
- `context/` owns message copy/share actions and assistant toolbar state/actions. Dynamic
  copied/busy/enabled state is consumed only by toolbar leaves; context menus consume only actions,
  and the virtualized list and expensive message body do not subscribe. Action handlers read the
  latest transcript and snapshot when invoked, so their identities change only when an action's
  availability does, not on every streamed update.
- `context/` also owns each row's conversation state beyond its list item: tool calls, attachments,
  and the timestamp boundary. Rows subscribe to it by message id and only rows whose state changed
  are woken. The list's `extraData` carries only list-wide presentation, because changing it
  refreshes every mounted row.
- `hooks/` owns the cover handoff after the list controller completes initial restoration.
- `utils/` contains pure helpers with co-located tests, including copyable-text projection.

Fork provenance stays on the Session, not in persisted Messages. When the copied boundary Message
is present in the paginated window, `ChatWorkspace` inserts a presentation-only system row after it;
until that boundary loads, the divider remains absent rather than attaching to a page edge.

With message actions enabled, long-pressing a settled user or assistant message opens copy and
share using the platform's default timing. iOS presents its native context menu; Android positions
CherryUI's menu at the long-press pointer, adjusted to stay inside the screen's safe area.
Copy uses the toolbar's existing text projection and clipboard action; content
without copyable text disables copy. Share opens the existing selector with the pressed message
selected. The menu carries non-destructive actions only: message text is selectable, so a long
press competes with the native selection gesture and resolves on whatever region the finger
reaches. Pending messages have no menu actions; their wrapper stays mounted so settling does not
recreate the streamed body. Android's scroll boundary cancels
menu recognition during drag and momentum; iOS relies on UIKit arbitration. The main answer's text
region is a `ContextMenuExclusion`, so holding the answer selects text instead of opening the
menu. Process details keep their own
selection and scrolling inside a `ContextMenuExclusion`, as do source entry points, attachments,
errors, and the assistant toolbar.

Deleting a turn is a toolbar action, not a menu action. The assistant toolbar shows it on any row
that carries a turn id — a synthetic divider or a send that has not been reserved yet has none —
and it confirms destructively before removing the pressed answer together with the question that
produced it: a transcript replays tool calls paired with their results, so half a turn is not
replayable. The button is disabled while the Session is busy, like retry, because a running turn's
rows must not disappear underneath it.
Holding these regions belongs to the child interaction and does not open the message menu.

`ChatWorkspace` observes the native screen-reader setting once for all rows. When enabled, settled
user messages show explicit copy/share buttons, including a share action for attachment-only
messages. Assistant messages keep their existing toolbar. These controls sit outside the message
content's accessibility nodes; the complete row is never grouped into a single accessible element
that would hide attachments or inline controls. A late initial status response cannot overwrite a
newer setting-change event.


## Message translation

The assistant toolbar offers translation for complete, successful text answers. It extracts only
answer text and code parts; reasoning, tool output, errors, and existing translations are excluded.
Before a translation exists, pressing translate opens a button-anchored language menu. Choosing a
language starts translation through `Backend.translation` with the configured translation model
(or the default model when unset).
Dismissal makes no request. Each answer owns its chosen language, independently of the app language
and other answers. Only the local Agent screen enables message translation. Remote conversations
provide no translation action or translation state provider.

`translation/MessageTranslationStore` owns requests for the open Session, independently of virtualized
row lifetimes. Button and result subscribe by message ID, so streamed translation does not rerender
the transcript or original Markdown. The original toolbar's translation button is the only disclosure
control: it keeps the same language icon and position, highlights while expanded, and toggles the
result below it. Folding removes the complete result block. The block has a plain separator without
a duplicate title or language heading. Its footer aligns icon-only copy, language selection, cancel,
and retry actions with the original message toolbar. Choosing a language restores its cached result
or starts translation when none is saved. Copy includes only the active translation text. Sharing
uses the original message's share action and selection page. Opening sharing captures the current
text and language of each expanded translation; folded translations are omitted even when cached.
Image, HTML, and Markdown include the captured translation beneath its selected original message,
independently of the thinking-content switch and with the existing watermark preference. Switching to a
saved language makes no translation request. The block is excluded from the enclosing message menu
and background press target, so
holding its Markdown selects translated text; scrolling and control taps remain
owned by the existing list and CherryUI controls. Leaving the screen cancels in-flight requests. A changed, retried,
removed, or incomplete source cannot accept a late result.
Choosing a different language cancels that answer's previous request and rejects its late chunks
and result. Retry uses the chosen target. Changing the app language does not change translation
targets or cancel requests; the transcript and reading position stay mounted.

Successful results live in the owning `agent_session_message.data.translations`, beside `parts`:
`{ sourceHash, results: { [language]: { content, createdAt } } }`. History and selected-message reads
include these reading aids with the message; there is no translation table, per-row hydration query,
or count-based eviction. The message-scoped Data API mutation merges a completed language inside a
serialized write transaction, after verifying the Session, message role, terminal status and exact
source hash. Other languages, parts, statistics and conversation activity are preserved.

Truncated, failed and cancelled results are never saved. Retry admission retains saved translations;
on successful settlement, the message store removes them only if the translated source text has
changed. Different reasoning or part IDs do not invalidate identical source text. A changed, removed,
retried or incomplete source still cancels in-flight work and rejects its late chunks and result.
Forking copies translations with the message data; deletion, database backup and restore follow the
message's existing lifecycle. Display readers isolate invalid translation metadata from the original
message. Canonical source extraction is shared with the persistence writer, and Runtime history
assembly reads only the original parts. Skill document translations keep their separate UI cache.

Selecting a previously translated language restores a matching result without another request.
Reopening the Session displays the most recently generated language in a folded state. The current
language and disclosure state belong to the open screen. Translation never adds a turn or changes
original-message copy, usage statistics or model history.

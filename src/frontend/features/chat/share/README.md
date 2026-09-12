# Chat Sharing

The assistant toolbar's share button enters message selection on the current chat list, with the
clicked answer initially selected. Every user and assistant row gains a left selection control;
system rows are excluded and pending messages cannot be selected. The ordinary message action
buttons are hidden while selection is active. Reading, disclosures and history pagination remain
available, and selected IDs survive rows leaving the visible window.

`ChatShareSelectionProvider` owns selection for the current composer/session identity. Its bottom
controls show cancel, selected count and confirm; the managed composer stays mounted but hidden.
Cancel or Android Back exits selection, and leaving the Session resets it. No preview opens before
confirmation. At most 128 messages can be selected; an empty selection cannot be confirmed.

Selection IDs live in one provider-owned store. Rows subscribe to their own selected boolean, and
the bottom controls subscribe to the count. Mode and action contexts stay stable across individual
toggles, so selecting a message does not rerender unrelated rows or message-action consumers.

Confirmation reads only the selected persisted messages through a single bounded ID query and restores
chronological order, regardless of click order. It does not implicitly include same-turn questions
or other unselected messages. The conversation may exceed 128 messages; only the selection and
export content budgets are bounded. Missing or unfinished selected content and failed reads reject
the export rather than returning a partial selection. Cancellation, unmount and backgrounding stop
pending reads. Returning from the export preview retains the selection for further edits.

The source adapter supplies two immutable document snapshots when thinking content exists: omitted
by default, and included when the preview checkbox is checked. Thinking covers the visible reasoning,
intermediate prose and readable tool names. Raw tool payloads and diagnostic metadata never enter
the document. The export page receives only a source-owned label and documents; it has no chat reads.

The adapter preserves plain user text and supplies bubble/message presentation hints. HTML and WebP
use the chat hierarchy: right-aligned questions, compact assistant headings and full-width answers,
with attachments above the question bubble. The conversation title remains the exported filename
and document title without adding an article heading above the exchange.

Process and reasoning keep explicit presentation hints. Their labels reuse the transcript's
`chat.process.duration` and `chat.reasoningStatus.thought` translations, and elapsed time uses the
same approval-wait-aware calculation as the message list. Native previews reuse the CherryUI
disclosures; HTML and WebP start with the same collapsed process summary.

Rendering, temporary files, permanent storage and system delivery remain in the application export
capability. Opening the preview renders an image without thinking content by default; changing the
format or checkbox renders the selected snapshot as needed.

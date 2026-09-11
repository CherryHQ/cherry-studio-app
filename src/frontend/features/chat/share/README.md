# Chat Sharing

The last action in the assistant toolbar opens the generic share preview directly. A bounded
persisted read supplies the clicked settled answer and its same-turn question, rejecting missing or
unfinished content. There is no history browser, message selector, or timestamp option.

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

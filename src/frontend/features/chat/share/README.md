# Chat Sharing

The assistant toolbar opens `/chat-share` with the session and clicked message IDs. The separate
page initially selects that answer and loads a paginated history window around it. User and
assistant rows show their role, time and up to four lines from a 240-character excerpt, with an
attachment-name fallback. Pending/streaming messages cannot be selected. Whole-row presses select;
scrolling retains ordinary native press cancellation. Excerpts do not render Markdown, media,
tools or reasoning. The exported document still contains the complete selected messages.

The original chat page stays mounted with its unchanged message widths, measured heights, scroll
position and composer draft. It no longer subscribes to sharing selection. The selector's rows are
safe to recycle: each reads its own selected boolean by message ID, while only the bottom controls
subscribe to the count. Individual toggles leave unrelated rows and action consumers stable.
These are source-level guarantees; device rendering/scroll performance is not yet measured.

`ChatShareSelectionProvider` owns IDs for one route identity. Cancel/native Back closes this page;
returning from the export preview retains the existing selection. At most 128 messages can be
selected; an empty selection cannot be confirmed. Leaving the page cancels pending export reads.

Confirmation reads only the selected persisted messages through a single bounded ID query and
restores chronological order, regardless of click order. It does not implicitly include questions
or unselected messages. The conversation may exceed 128 messages. Missing or unfinished content
and failed reads reject the export instead of silently sharing a partial selection.

The source adapter supplies two immutable document snapshots when thinking content exists: omitted
by default, and included when the preview switch is enabled. Thinking covers the visible reasoning,
intermediate prose and readable tool names. Raw tool payloads and diagnostic metadata never enter
the document. The export page receives only a source-owned label and documents; it has no chat reads.

The adapter preserves plain user text and supplies bubble/message presentation hints. HTML uses
the chat hierarchy: right-aligned questions and full-width answers. Framed WebP uses numbered
message sections with theme-aware branding. The conversation title remains the exported filename
and document title without adding an article heading above the exchange.

Process and reasoning keep explicit presentation hints. Their labels reuse the transcript's
`chat.process.duration` and `chat.reasoningStatus.thought` translations, and elapsed time uses the
same approval-wait-aware calculation as the message list. Native previews reuse the CherryUI
disclosures; HTML and WebP start with the same collapsed process summary.

Rendering, temporary files, permanent storage and system delivery remain in the application export
capability. Opening the preview renders an image without thinking content by default; changing the
format or switch renders the selected snapshot as needed.

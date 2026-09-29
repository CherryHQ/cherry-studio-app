# Chat Sharing

The assistant toolbar and user/assistant message context menus open `/chat-share` with the session
and clicked message IDs. The separate page initially selects that message and loads a paginated
history window around it. User and assistant rows show their role, time and up to four lines from a 240-character excerpt, with an
attachment-name fallback. Pending/streaming messages cannot be selected. Whole-row presses select;
scrolling retains ordinary native press cancellation. Excerpts do not render Markdown, media,
tools or reasoning. The exported document still contains the complete selected messages.

The original chat page stays mounted with its unchanged message widths, measured heights, scroll
position and composer draft. It no longer subscribes to sharing selection. The selector's rows are
safe to recycle: each reads its own selected boolean by message ID, while only the bottom controls
subscribe to the count. Individual toggles leave unrelated rows and action consumers stable.
These are source-level guarantees; device rendering/scroll performance is not yet measured.

`ChatShareSelectionProvider` owns IDs for one route identity. Cancel/native Back closes this page;
closing the export preview retains the existing selection, while a closed system share sheet
dismisses both pages to the chat. At most 128 messages can be selected; an empty selection cannot
be confirmed. Leaving the page cancels pending export reads.

Confirmation calls the share target's `prepareSelection`. The local route reads messages, session
title and assistant name in one SQLite snapshot through the Data API; the desktop route calls the
opened remote Session, which reads and revalidates a fixed history revision. Both return chronological order, regardless of click order. It does not implicitly include questions
or unselected messages. The conversation may exceed 128 messages. Missing or unfinished content
and failed reads reject the export instead of silently sharing a partial selection.

Any nonempty selection defaults to ordered PNG pages containing all selected messages in chronological
order. Short selections produce one page; the layout menu also offers a single long image. Image, HTML and Markdown remain available regardless of the selected message count, including
when thinking content is toggled. There is no image-size gate before conversion.

The source adapter supplies two immutable document snapshots when thinking content exists: omitted
by default, and included when the preview switch is enabled. Thinking covers the visible reasoning,
intermediate prose and readable tool names. Raw tool payloads and diagnostic metadata never enter
the document. The export page receives only a source-owned label and documents; it has no chat reads.

The adapter preserves plain user text and supplies source-owned role hints. Managed images retain
their transcript position relative to the answer. Sharing and the message list reuse the same
standalone-image-reference filter: an invented preview URL ending in an image ID already owned by
that message is omitted, while unrelated images and code examples stay intact. Non-image files
collect after the answer. Images and HTML use
the message-list hierarchy: attachments above right-aligned user bubbles and full-width answers
under the assistant name. They omit article titles and message numbering. Markdown retains the
conversation title and ordinary role headings. All preserve chronological order.
The export renderers own code, resource, source-list and table presentation and their format-specific
fallbacks. Images and HTML show the opening code inside fixed 192-point panels; HTML retains full
code with internal scrolling, and Markdown keeps the complete authored source. Images and HTML show
one compact source-count row with a single Globe icon and the same localized count as the chat,
plus quiet superscript citations, without individual source cards.
Inline code stays visible in every format. All formats follow the global Share watermark setting. Images and HTML share the white
Cherry footer; Markdown uses the matching brand/time text row.

Process and reasoning keep explicit presentation hints. Their labels reuse the transcript's
`chat.process.duration` and `chat.reasoningStatus.thought` translations, and elapsed time uses the
same approval-wait-aware calculation as the message list. HTML starts collapsed; image capture
expands included process/reasoning content. Markdown uses portable nested blockquotes and its
preview renders the prepared file through the shared export HTML renderer. Local/generated pictures
are embedded as Base64 PNG/JPEG data URLs and display without captions; remote image links become
compact name/domain entries in the preview and remain intact in the Markdown file.

Rendering, temporary files, permanent storage and system delivery remain in the application export
capability. Opening the preview renders the selection's default format without thinking content;
changing the format or switch renders the selected snapshot as needed. Image output uses a fixed-width layout at
3x density and sequential page capture, without source-image byte, pixel or count caps. Device resources determine practical
capacity. Image conversion failures prepare HTML; HTML failures retain the complete Markdown preview.

Local and desktop routes share the selection controls, the history window shape and export
preparation; the local route uses the Session-keyed local history window and the desktop route the
remote revisioned window. The desktop route binds the selection to its source scope, so a replaced
pairing cannot reuse the previous selection. The preparation validates the entire selected set.
Remote resources never become local file IDs; file metadata exports as named attachments. Partial
messages cannot be selected as complete export content.

Local documents keep their existing managed-file references and the document renderer resolves
them; the underlying bytes are not pinned for the duration of the export.

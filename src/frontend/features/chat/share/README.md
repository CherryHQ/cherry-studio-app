# Chat Sharing

The message Share action enters selection in the existing local or desktop transcript and selects
the triggering message. The screen owns one selection scope shared by its transcript and header.
The header shows the selected count and one back action; the composer stays mounted with its draft.
A 40-point leading column holds circular marks. Whole-row taps toggle selection, adjacent selected
rows share a neutral surface, and long answers collapse with a fade. Selecting a question also
selects its currently displayed completed answer; deselecting a question leaves the answer selected.
Alternative answers cannot be switched while selecting.

Only the checkbox column claims drag selection; native body scrolling and stationary text selection
retain their owners. Native pan recognition supplies movement thresholds. Crossing rows selects or
deselects in the starting row's mode. At the edges, scrolling goes through MessageList's direct
interaction handle, preserving its reading-position and follow-state ownership.

The bottom bar contains Select all and Share using Button's `footer` size: Android keeps compact
labels with minimum 48-point touch targets. Select all reads the complete current conversation
path, including unloaded history, without expanding the mounted message window. Local reads use
the existing cursor API; desktop reads use a disposable revision-bound history window. More than
128 exportable messages reports the limit without replacing the previous selection. Cancelling
selection, changing the source or leaving the route cancels pending work.

Confirmation reads a fixed source snapshot in chronological order and opens the common `/share`
panel. Local data uses one selected-ID SQLite read; desktop data uses the opened remote Session's
revision-checked selection API. Missing, partial and unfinished messages reject the whole request.

Only selected user text, final assistant answers, static pictures, attachment information, citations
and matching expanded translations enter the document. Thinking, intermediate prose, tool names,
steps, duration, usage and diagnostic payloads never enter any format. There is no process option
or alternate document. Native source citations remain references, not tool execution records.

Visible local translations are captured in the in-memory selection state at entry. Their source
hash is validated against the fresh snapshot before export. Folded or stale translations stay out;
sharing never translates again. Text and callbacks do not enter route params. Replaced remote
Sessions invalidate selection instead of reusing another connection's state.

All nonempty selections support Image, HTML and Markdown. Image uses one 360-point-wide card,
fixed 3x output and a 3600-point whole-image ceiling. Measured block/line truncation ends with a
quiet ellipsis; HTML/Markdown retain the full content. Rendering,
temporary files, explicit persistence and
system delivery belong to the shared sharing and document-export owners. Closing the panel returns
to the original transcript; changing the range starts again there. Native rendering and scroll
performance still require authorized device acceptance.

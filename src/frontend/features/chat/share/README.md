# Chat Sharing

The message Share action enters selection in the existing local or desktop transcript. Circular
controls occupy the avatar or empty header space without narrowing Markdown. Selection uses keyed
boolean subscriptions; only its marker and count update when a message is toggled. The composer
stays mounted with its draft and measurement, while selection owns the bottom controls. Cancel or
Android Back exits selection. Branch changes and message mutations are disabled during selection.

Confirmation reads a fixed source snapshot in chronological order and opens the common `/share`
panel. Local data uses one selected-ID SQLite read; desktop data uses the opened remote Session's
revision-checked selection API. Missing, partial and unfinished messages reject the whole request.
The 128-message selection limit remains. Questions are never added implicitly.

Only selected user text, final assistant answers, static pictures, attachment information, citations
and matching expanded translations enter the document. Thinking, intermediate prose, tool names,
steps, duration, usage and diagnostic payloads never enter any format. There is no process option
or alternate document. Native source citations remain references, not tool execution records.

Visible local translations are captured in the in-memory selection state at entry. Their source
hash is validated against the fresh snapshot before export. Folded or stale translations stay out;
sharing never translates again. Text and callbacks do not enter route params. Replaced remote
Sessions invalidate selection instead of reusing another connection's state.

All nonempty selections support Image, HTML and Markdown. Image uses one bounded card with an
explicit excerpt notice for long selections; HTML/Markdown retain the full content. Rendering,
temporary files, explicit persistence and
system delivery belong to the shared sharing and document-export owners. Closing the panel returns
to the original transcript; changing the range starts again there. Native rendering and scroll
performance still require authorized device acceptance.

# Chat Sharing

The toolbar opens this child page with a source Session and message ID. It owns explicit message
selection, persisted reloads, source options, and conversion of Agent message views into the generic
export document. It does not own rendering, filesystem output or sharing UI.

History browsing uses a bounded window while selected IDs remain independent of loaded pages.
Confirmation reloads every selected ID, checks settled status and ordering, then hands an immutable
document to `appShell/documentExport`. Process and timestamps are opt-in. Raw tool payloads and
diagnostic metadata never enter the document.

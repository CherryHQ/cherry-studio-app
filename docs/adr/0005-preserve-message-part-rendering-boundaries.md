# Preserve Message Part Rendering Boundaries

Cherry Mobile renders structured Message Parts directly instead of flattening a whole Message into one Markdown string and inferring part types afterward. Markdown-capable assistant parts use the unified `StreamdownText` path for both active Streaming Message Overlay output and stable historical Messages because the product boundary is the Message Part type, not active-versus-stable renderer identity.

**Considered Options**

- Flatten a message into one Markdown string.
- Render every Markdown-capable assistant part through one Streamdown path.
- Keep active streaming parts and stable historical parts on separate Markdown renderer paths.

**Consequences**

The Message History Window stays database-backed and static; active assistant output is composed
through an in-memory Streaming Message Overlay until terminal `parts` and `status` are persisted.
Render components do not write SQLite. A separate stable renderer, Streaming Text Store, UI throttle,
checkpoint scheduler, or usage stats update can still be added later, but only for a measured
performance, compatibility, or product need and with backend `ChatSession` ownership for stream
cadence or persistence cadence.

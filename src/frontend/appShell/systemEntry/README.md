# System Entry

The app shell owns one foreground consumer for native shares. It starts only after the bootstrap
and router gates are ready.

A share is composer content, not a submission: `SystemEntryBridge` claims one staged share per
pass, opens a chat draft under the Agent a new chat would use, and hands its text and library
attachments to that composer. Nothing is sent until the user sends it, and switching Agents from
there keeps what they are looking at. Without an Agent to open, the share stays staged for a later
pass. Route parameters carry a memory-only handoff token, never shared text or file paths.

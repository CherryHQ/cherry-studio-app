# System Entry

The app shell owns one foreground consumer for native shares. It starts only after the bootstrap
and router gates are ready.

A share is composer content, not a submission: `SystemEntryBridge` claims one staged share per
pass, opens a chat draft under the Agent a new chat would use, and hands its text and library
attachments to that composer. Nothing is sent until the user sends it, and switching Agents from
there keeps what they are looking at. Without an Agent to open, the share stays staged for a later
pass. Route parameters carry a memory-only handoff token, never shared text or file paths.

`useSystemEntryClaims` owns the claim loop. A resolved claim has already completed its native entry,
so the hook delivers it through the latest render rather than the effect that started it, holds it
while the shell cannot open it, and runs a claim requested meanwhile once the current one settles.
Delivery seeds the chat in view, or dismisses to chat, which replaces the current page when chat is
not in the stack.

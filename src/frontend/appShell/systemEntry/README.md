# System Entry

The app shell owns one foreground consumer for native system actions. It starts only after the
bootstrap and router gates are ready, and releases outstanding claims when its host unmounts.
The backend owns admission, imports, deduplication, and native replies; this module owns navigation
and localized feedback. Route parameters carry memory-only handoff tokens, never shared text or
file paths. A share review owns dismissal once presented.

Agent-index synchronization is enabled only when the backend exposes `refreshShortcuts` for native
consumers (currently iOS App Intents). It runs once the Agent query succeeds, on Agent changes, and
on foreground entry; router readiness only starts the action consumer.

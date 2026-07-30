# Use Startup Gates Instead Of Lifecycle Phases

Cherry Mobile uses startup gates for performance and first chat paint boundaries instead of desktop lifecycle phases. The current gate is `AppBootstrapGate`, which waits for the in-process backend runtime and boot preferences; current topic, message window, and `ChatSession` loading remain route-level work.

**Considered Options**

- Keep Cherry desktop phase names such as `BeforeReady`, `WhenReady`, and `Background`.
- Rename them to mobile startup gates.

**Consequences**

`AppBootstrapGate` is the only current gate allowed to block app rendering, and it must stay small: database readiness, initial preferences, and boot preferences. Provider catalog refresh, non-current history, sync, diagnostics, current topic hydration, and message window loading must not be folded into the gate without a deliberate performance decision.

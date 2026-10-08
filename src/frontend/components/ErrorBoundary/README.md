# Error Boundary

`ErrorBoundary` contains a render failure to the subtree it wraps and renders the owner's fallback
in its place. The app shell wraps the navigation tree with it, and `Message` wraps each list row so
one message that cannot render does not take down the conversation.

- Every boundary names a fixed `operation`. The failure is logged through `LoggerService`, which
  forwards it to crash reporting only in production and only with the user's consent; see
  [Observability](../../appShell/observability/README.md).
- The fallback receives `reset`, which renders the children again. `resetKeys` does the same
  whenever one of its values changes, so a row retries when its data changes.
- Copy, layout, and recovery actions belong to the owner's fallback, not to this module.

# Cherry Mobile Runtime Ownership

Status: current

Related decisions:

- [ADR 0001: Use Provider-Owned Runtime Owners](../adr/0001-use-provider-owned-runtime-owners.md)
- [ADR 0002: Use Startup Gates Instead Of Lifecycle Phases](../adr/0002-use-startup-gates-not-lifecycle-phases.md)

This document defines which Cherry Mobile objects currently own runtime resources and which startup work may block first chat paint. Terms follow [CONTEXT.md](../../CONTEXT.md).

## Principles

- Mobile does not port Cherry desktop's lifecycle framework, global service registry, `defineService` DSL, or phase dependency graph.
- A runtime owner is only needed for work or resources that can outlive the current function call.
- Runtime owners are held by React Providers where possible, with lifetime tied to Provider mount/unmount. AppState and screen-focus hooks are added only when a runtime actually needs them.
- App background is not treated as a reliable execution window for active chat streams. A runtime must not claim background checkpoint, pause, or resume behavior unless it has explicit platform support and tests for that behavior.
- Startup gates express startup performance boundaries only. They are not OS lifecycle phases or desktop service phases.
- Plain helpers, repositories, query wrappers, parsers, validators, transforms, and UI state are not runtime owners by default.

## Resources That Need Owners

These resources must have an explicit owner and cleanup. Background/resume behavior is required only when the resource is expected to survive app backgrounding.

- SQLite/Drizzle connections, migration locks, or long transaction boundaries.
- AI chat streams, stream readers, AbortControllers, stream snapshots, and checkpoint schedulers when present.
- AppState listeners, navigation/screen focus listeners, and native event listeners.
- Timers, debounce schedulers, retry queues, background queues, and workers.
- Sockets, subscriptions, download/upload tasks, and native module sessions.
- Long-lived caches with invalidation or refresh logic.

One-shot network requests, pure transforms, schema validation, Message Part parsers, and render components do not become owners just because they are important. They become runtime owners only when they hold one of the resources above.

## Current Owner Boundaries

`DataProvider`:

- Owns `DbService`, SQLite/Drizzle initialization, bundled migrations, custom SQL, seeders, initial preference loading, app bootstrap, and `DbService.dispose()`.
- Creates the Data Service Graph through `createDataServices()` (injectable via `createRuntime` for tests).
- Hides the native splash once init settles and fires `runPostReadyTasks` after the gate opens.
- Disposes `WebSearchService` API-key rotation state and closes the SQLite database on unmount.
- Does not own chat streams or route-level chat state.

`QueryProvider`:

- Owns the React Query client.
- Connects React Query focus state to React Native `AppState`.
- Does not own SQLite resources or chat stream AbortControllers.

`ChatRuntimeProvider`:

- Owns one `ChatRuntime` for the chat route group.
- Injects Data Services, message-query invalidation, topic-list invalidation, and navigation handoff into the runtime.
- Calls `runtime.dispose()` on Provider unmount.
- Does not attach AppState `resume/background` listeners for active chat streams.

`ChatRuntime`:

- Owns active turn state by topic id, AbortControllers, assistant placeholder ids, and in-memory topic snapshots.
- Persists the user message and assistant placeholder before streaming.
- Reads AI SDK UI message chunks through `readUIMessageStream()` and exposes the active assistant Message as a Streaming Message Overlay.
- On success, updates the assistant placeholder with terminal `data.parts` and `status`.
- On failure, appends a `data-error` part and marks status `error`; on user abort, persists partial parts with status `paused`.
- On abort or dispose, aborts active AbortControllers.
- Does not promise that an active stream will continue, checkpoint, pause, resume, or save terminal state after the app is backgrounded, suspended, or killed by the OS.

Feature-local sheets and native sessions:

- Components that open native or Expo UI sessions own those sessions through local refs and cleanup. Examples include model picker and provider settings bottom sheets.

## Provider Shape

The current shape is to create long-lived resources explicitly in a Provider and clean them up through React effects:

```tsx
function ChatRuntimeProvider({ children }: PropsWithChildren) {
  const [runtime] = useState(() => new ChatRuntime(dependencies))

  useEffect(() => {
    return () => runtime.dispose()
  }, [runtime])

  return <ChatRuntimeContext value={{ runtime }}>{children}</ChatRuntimeContext>
}
```

This shape is illustrative. Not every runtime must expose exactly the same methods. The requirement is clear ownership, clear resources, and clear cleanup.

## Startup Gates

`bootstrapAppRuntime`:

- Reads cached boot preferences.
- Applies Uniwind theme mode.
- Initializes i18n.
- Must not run full provider refresh, full history prefetch, index building, data repair, or diagnostics.

`runPostReadyTasks`:

- Runs after the gate opens (first paint), off the startup critical path.
- Currently performs orphan pending-Message reconciliation (crash-orphaned `pending` assistant messages).
- `DataProvider` fires it fire-and-forget once status becomes `ready`; it must stay best-effort and must not block or reopen the gate.

`InitialDataGate`:

- The only current gate allowed to block initial app rendering.
- Waits for `DataProvider` status to become ready.
- Renders `null` while data initializes and throws initialization errors.
- The native splash is retained across this window: the root layout calls `SplashScreen.preventAutoHideAsync` and `DataProvider` calls `SplashScreen.hideAsync` once init settles (ready or error), so the `null` frame is never a blank screen. The hide is imperative, not an effect, because the error path throws during gate render.
- Does not currently wait for current assistant/topic, message windows, or chat runtime state.

Route-level loading:

- Current topic, topic detail hydration, and Message History Window loading happen through route/screen hooks after the data runtime is ready.
- Full-history prefetch, diagnostics, and non-current work must not blank the current chat screen.

Provider/model refresh:

- Provider/model catalog refresh and model pull/reconcile flows remain ordinary service calls behind React Query mutations.
- They do not become runtime owners unless they add a long-lived scheduler, subscription, cache refresh loop, retry queue, or other resource that can outlive the current mutation.

## Non-Goals

- Background chat streaming, background checkpointing, and recoverable stream resume.

## Reopen When

- A new long-lived resource appears.
- Startup requirements change enough to justify a new gate.

## Acceptance

- Cold start into the current conversation does not wait for non-current history, provider/model refresh, or diagnostics.
- `DataProvider` unmount closes the SQLite database and disposes service-local long-lived state.
- `ChatRuntimeProvider` unmount aborts active chat streams through `runtime.dispose()`.
- User abort produces a clear terminal state for the active assistant Message.
- Every new long-lived resource can answer: who owns it, when it is released, and whether it needs explicit app background behavior.

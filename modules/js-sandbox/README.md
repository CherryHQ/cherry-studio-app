# JS Sandbox

Runs model-written JavaScript for the Agent's `run_js` tool, discovered by Expo under `modules/`.
Requires a new native build; clients without the module omit the tool. The tool contract and
limits are described in [Agent Tools And Controlled Resources](../../docs/references/agent/agent-tools-and-resources.md#javascript-sandbox).

## Design

Each `run(runId, code, limits)` creates a fresh Hermes runtime from `hardenedHermesRuntimeConfig()`
on a dedicated native thread and destroys it afterwards. The app's own Hermes runtime and JS thread
are untouched, so a busy script cannot stall the UI and cannot reach app state: the sandbox's global
object contains only ECMAScript built-ins plus a captured `console`. The C++ core in `cpp/` is shared
by the iOS (Objective-C++ bridge) and Android (JNI) adapters and links the Hermes build that ships
with React Native, adding nothing to the app size.

The configuration choices are measured against React Native 0.86's Hermes release build:

| Setting | Reason |
| --- | --- |
| `ES6BlockScoping` on | Off by default for source compiled on device; `for (let …)` closures would otherwise share one binding and compute wrong results silently. |
| `MicrotaskQueue` on | Off by default; `await` would never resume. |
| `watchTimeLimit` / `asyncTriggerTimeout` | Interrupt a running script from another thread; JavaScript cannot catch the interruption. Also used for cancellation. |
| GC tripwire as the memory limit | Exceeding Hermes' `MaxHeapSize` aborts the whole process. The tripwire fires after a collection above the soft limit and interrupts the script, while the hard maximum stays far higher so allocation cannot outrun it. The tripwire fires once per runtime, which is one reason every run gets a new runtime (creation costs well under a millisecond). |

Very large single allocations (long strings, huge arrays or `ArrayBuffer`s) fail with ordinary
catchable `RangeError`s. A regular expression with catastrophic backtracking is interrupted, but may
overrun the deadline by a few seconds.

## Contract

`run` resolves with a JSON string; script failures never reject:

```text
{ status: 'ok', result?: <JSON text>, resultTruncated?, logs, logsTruncated, durationMs }
{ status: 'error', kind, message, logs, logsTruncated, durationMs }
```

`kind` is `syntax`, `exception`, `timeout`, `memory`, `unsettled` (the returned promise can never
settle, since there are no timers or I/O), `cancelled`, or `internal`. `cancel(runId)` interrupts a
run and ignores unknown ids. The caller (`src/backend/services/jsSandbox`) owns the limits.

## Verification

The core can be exercised on macOS without building the app by compiling `cpp/JsSandbox.cpp`
against the macOS slice of the matching `hermes-ios-<version>-hermes-ios-release.tar.gz` from Maven
Central. Device behavior (iOS and Android Hermes builds, Android `Intl` through JNI) needs a new
development build.

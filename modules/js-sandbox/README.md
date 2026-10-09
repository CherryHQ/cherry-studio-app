# JS Sandbox

Runs model-written JavaScript for the Agent's `run_js` tool, discovered by Expo under `modules/`.
Requires a new native build; clients without the module omit the tool. The tool contract and
limits are described in [Agent Tools And Controlled Resources](../../docs/references/agent/agent-tools-and-resources.md#javascript-sandbox).

## Design

Each `run(runId, code, limits)` creates a fresh [QuickJS-NG](https://github.com/quickjs-ng/quickjs)
runtime on a dedicated native thread and destroys it afterwards; the script is an in-memory string
and nothing touches the file system. Execution happens outside the app's Hermes runtime and JS
thread, without access to app state. The caller limits concurrent native runs to bound aggregate
resource use. QuickJS' `std` and `os` modules are not
compiled in, so the sandbox's global object contains only ECMAScript built-ins, `atob`/`btoa`,
`queueMicrotask`, `performance`, and a captured `console`. The C++ core in `cpp/` is
shared by the iOS (Objective-C++ bridge) and Android (JNI) adapters.

Every call starts fresh. The caller supplies all input values in the code and receives the returned
value and console output; the sandbox keeps no state between calls.

QuickJS was chosen because it is built to embed untrusted code with budgets:

| Budget | Mechanism |
| --- | --- |
| Time and cancellation | QuickJS polls an interrupt handler during bytecode and regular expression execution. Once it fires, the error is uncatchable and every later job stops too. `timeoutMs` 0 means no deadline, so a cancel that arrives before its run registers is held for it rather than lost. |
| Memory | The runtime allocates through `cpp/JsSandbox.cpp`'s allocator, which refuses allocations past the heap limit. The script sees a catchable out-of-memory error. The allocator also records that the limit was hit, because QuickJS cannot always allocate the error object itself. Native stacks and host output copies sit outside this heap budget; the runtime shares the app process. |
| Native stack | QuickJS throws a catchable `RangeError` past 7 MiB of the 8 MiB thread stack, about 7,000 JavaScript calls deep. Deep JSON, nested source, and regular expressions are bounded by the same check. |

QuickJS has no `Intl`, so locale arguments to `toLocaleString` and similar methods are ignored.

Both platforms compile QuickJS at `-O2`, including debug builds: at `-O0` it runs about 9x slower,
and its larger frames cut the recursion that fits in the stack to about 800 calls.

## Contract

`run` resolves with a JSON string; script failures never reject:

```text
{ status: 'ok', result?: <JSON text>, resultTruncated?, logs, logsTruncated, durationMs }
{ status: 'error', kind, message, logs, logsTruncated, durationMs }
```

`kind` is `syntax`, `exception`, `timeout`, `memory`, `unsettled` (the returned promise can never
settle, since there are no timers or I/O), `cancelled`, or `internal`. `cancel(runId)` interrupts a
run, including one that has not started yet. The caller (`src/backend/services/jsSandbox`) owns the
limits.

The `run_js` tool defaults to a 5-second execution deadline and allows at most 30 seconds. The
sandbox service shares a two-run limit across turns, queues extra calls, and retains a cancelled
run's slot until the native promise settles. Waiting in the queue does not consume the execution
deadline. The low-level native API still leaves policy to its caller.

## QuickJS-NG

`vendor/quickjs-ng` holds the unmodified `quickjs-amalgam.c` and `quickjs.h` from the
`quickjs-amalgam.zip` asset of [QuickJS-NG v0.17.0](https://github.com/quickjs-ng/quickjs/releases/tag/v0.17.0)
(SHA-256 `a0955463c74809173a253ff87365095e6972e8b171cfb6aa8a1e781adf35cfeb`), with its MIT license.
`cpp/QuickJs.c` compiles it as one translation unit with assertions off, as in upstream release
builds. To update, replace both files from a newer release's amalgamation, update the version and
checksum here, and rerun the verification below.

## Verification

The core can be exercised on macOS without building the app by compiling `cpp/JsSandbox.cpp` and
`cpp/QuickJs.c` into a small harness that calls `run` and `cancel` on threads with an 8 MiB stack;
building it with `-fsanitize=address,undefined` and without `NDEBUG` also checks QuickJS' own
assertions, including that every value is released before the runtime is freed. Device behavior
needs a new development build.

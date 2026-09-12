# Instrumentation

Use this reference when a diagnosis needs logs, runtime probes, metrics, or temporary debug hooks.

## Log Format

Every temporary log must have:

- absolute timestamp first
- stable prefix
- debug id for the current pass
- event name
- compact structured payload
- sequence number when ordering matters

Example:

```ts
const DEBUG_ID = "checkout-total-v2";
let seq = 0;

console.log(`${Date.now()} [DEBUG ${DEBUG_ID}] price-recalculated`, {
  seq: ++seq,
  cartId,
  previousTotal,
  nextTotal,
});
```

Change the debug id when instrumentation changes materially.

## Where To Probe

Instrument causal boundaries, not symptoms:

- state writes and derived-state updates
- render, effect, subscription, and lifecycle boundaries
- event handlers and async callbacks
- allocator, cache, and ownership transitions
- layout measurements and final applied layout values
- native/JS bridge handoffs
- network, persistence, and cache boundaries
- scheduler, timer, animation-frame, and debounce/throttle handoffs

When multiple layers might disagree, log comparable fields on both sides of the boundary with the same debug id.

## Avoid Perturbing Bugs

If logging may change timing or hide the bug, do not rely on hot-path `console.log`.

Prefer:

- buffered in-memory events with a dump function
- file logs or a debug registry
- sampled logs
- profiler or metric output
- delayed flush after the interaction settles
- targeted counters instead of full payload dumps

If adding logs changes reproducibility, switch to a less perturbing strategy before drawing conclusions.

## Confidence Loop

After each instrumentation pass, re-rank every plausible cause and update its confidence score. Record which observation changed the score.

Before adding another probe, state which possible result would change the ranking or confidence. If no result would add discriminating evidence, or the last pass added no evidence and no distinct boundary remains, stop as incomplete instead of repeating.

## Keeping Logs

Keep diagnostic logs in place while diagnosis is ongoing. Do not remove them just because a candidate cause is found; the user may want to continue diagnosing.

Remove temporary logs only when:

- the user explicitly asks to remove or clean up debug logs
- the logs are converted into intentional durable diagnostics
- the user explicitly asks for a final cleanup pass

## Commit Staging

If the user asks to commit during or after diagnosis:

1. Do not remove temporary logs just because of the commit.
2. Stage only intended durable changes with path-limited staging.
3. Verify the staged diff excludes temporary logs and throwaway probes.
4. Commit the staged changes.
5. Report which diagnostic files remain unstaged.

Temporary logs should remain unstaged unless the user explicitly asks to commit durable diagnostics.

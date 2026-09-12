---
title: Profile React Performance
impact: MEDIUM
tags: profiling, devtools, re-renders, flamegraph
---

# Skill: Profile React Performance

Identify unnecessary re-renders and performance bottlenecks in React Native apps using React Native DevTools through `agent-device react-devtools`.

## Quick Command

```bash
agent-device react-devtools status
agent-device react-devtools wait --connected
agent-device react-devtools profile start
agent-device react-devtools profile stop
agent-device react-devtools profile slow --limit 5
agent-device react-devtools profile rerenders --limit 5
agent-device react-devtools profile timeline --limit 20
```

Drive the target interaction with normal `agent-device` commands between `profile start` and `profile stop`. For targeted audits, profile the exact flow under review. Baseline output should include commit timeline, re-render counts, slow components, and a breakdown of the heaviest commit.

## When to Use

- App feels sluggish or janky during interactions
- Need to identify which components re-render unnecessarily
- Investigating slow list scrolling or form inputs
- Before applying memoization or state management changes

## Prerequisites

- React Native DevTools connection available through `agent-device react-devtools`
- App running in development mode
- React DevTools version compatible with the app's React and React Native versions
- For release-build profiling, [`@callstack/inspector`](https://github.com/callstackincubator/inspector#inspector) installed and connected first

> **Note**: Prefer `agent-device react-devtools` over the visual DevTools UI for token-efficient React profiling and debugging. Use the visual UI or exported profiler JSON only when the CLI output is insufficient. Record concrete commit times, render counts, and component names.

Manual fallback when `agent-device` is unavailable: open React Native DevTools from Metro (`j`) or the Dev Menu, use the Profiler tab, and record the same interaction. Keep this as fallback only; agent runs should prefer the CLI summaries above.

## Step-by-Step Instructions

### 1. Connect React Native DevTools

```bash
agent-device react-devtools status
agent-device react-devtools wait --connected
```

If `status` reports the helper is not running, start it first:

```bash
agent-device react-devtools start
agent-device react-devtools wait --connected
```

#### Release Builds

React Native release builds do not expose the same profiling path by default. Before using `agent-device react-devtools` against a release app, wire in `@callstack/inspector`:

```bash
npm install @callstack/inspector
npx inspector start
```

Import `@callstack/inspector` as the first module in the app entrypoint, wrap Metro config with `withInspector(config, true)`, then build and run the app in release mode. For Expo, use a release build from prebuild/dev-client flow; Expo Go is not a release-build profiling target.

### 2. Record a Profiling Session

```bash
agent-device react-devtools profile start
agent-device react-devtools profile stop
```

Drive the exact interaction or navigation flow under review between those two commands.

For AI-agent workflows, treat this as a required sequence:

1. Run `agent-device react-devtools status`.
2. Run `agent-device react-devtools wait --connected`.
3. Start profiling immediately before the audited interaction.
4. Drive the flow with normal `agent-device` commands.
5. Stop profiling.
6. Inspect slow components, re-render counts, and commit timing before proposing fixes.

### 3. Analyze Results

![React DevTools Flamegraph](images/devtools-flamegraph.png)

Use bounded CLI summaries first:

```bash
agent-device react-devtools profile slow --limit 5
agent-device react-devtools profile rerenders --limit 5
agent-device react-devtools profile timeline --limit 20
```

Then drill into a specific component:

```bash
agent-device react-devtools profile report @c5
agent-device react-devtools get component @c5
```

Use the component ref printed by `profile slow`, `profile rerenders`, or `get tree`; `@c5` is only an example.

Use the visual flame graph or exported profiler JSON only when the bounded CLI summaries do not answer the question.

### 4. Profile JavaScript CPU

For non-React CPU issues, use platform CPU profilers or `agent-device perf` instead of React DevTools render profiling.

## Interpreting Results

| Symptom | Likely Cause | Solution |
|---------|--------------|----------|
| Many yellow components | Cascading re-renders | Add memoization or use React Compiler |
| "Props changed" on callbacks | Inline functions recreated | Use `useCallback` |
| "Parent component rendered" | State too high in tree | Move state down or use atomic state |
| Long JS thread block | Heavy computation | Move to background or use `useDeferredValue` |

Only propose callback or dependency-array changes when the profiler or a reproducible bug shows they matter. Do not infer stale closures from a snippet alone.

## Common Pitfalls

- **Using one build type for every question**: Use `agent-device react-devtools` in development to identify render causes, commit patterns, and expensive components. Validate timing-sensitive FPS/CPU improvements in production or release-like builds.
- **Not using production builds**: Some issues only appear with minified code
- **Ignoring "Why did this render?"**: This tells you exactly what to fix
- **Using component tree depth or count as the main baseline**: These are secondary context, not the core performance signal

## Related Skills

- [js-react-compiler.md](./js-react-compiler.md) - Automatic memoization
- [js-atomic-state.md](./js-atomic-state.md) - Reduce re-renders with Jotai/Zustand
- [js-bottomsheet.md](./js-bottomsheet.md) - Profile bottom sheet callback-driven re-renders
- [js-measure-fps.md](./js-measure-fps.md) - Quantify frame rate impact

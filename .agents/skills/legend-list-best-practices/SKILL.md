---
name: legend-list-best-practices
description: Build, audit, and fix @legendapp/list and LegendList usage in React, React Native, and web apps. Use for virtualization, scroll blanking, mount cost, data identity, recycling, row invalidation, measurement, chat anchoring, drawDistance, visibility, or Legend List performance regressions.
---

# Legend List Best Practices

Apply Legend List-specific contracts, not generic prop tuning. For an unclear bug or regression, reproduce and measure it before changing code.

## Surface And Workflow

- Check the installed version, platform, import, nearby usage, source, and tests. Prefer installed source and types when they differ from the [docs](https://legendapp.com/open-source/list/v3/overview/) or [LLM index](https://legendapp.com/open-source/list/v3/llms.txt).
- Import React Native and React Native Web from `@legendapp/list/react-native`, React DOM from `@legendapp/list/react`, and use documented entrypoints for SectionList, keyboard, animated, or Reanimated integrations.
- Use either `data` plus `renderItem` or children mode; never mix them.
- **Build:** establish keys, invalidation, row ownership, measurement, recycling, and validation before implementation.
- **Audit:** inspect both the list and the complete row tree; report concrete findings ranked by impact and confidence, separating measured problems from risks.
- **Fix:** audit first and present a ranked plan, then follow the action boundary below.

Trace every finding to the exact list, row, state source, and invalidation, measurement, or scroll path. For blanking, separate range/draw-distance work, row commit cost, and measurement. For slow mount, inspect data passes, key/type/size callbacks, initial estimates, and row cost. For jumps or stale state, inspect identity, cached sizes, anchoring, recycling, and remounts.

## Doing Vs. Suggesting

- Suggest every evidence-backed improvement, including sweeping architecture, only when the user asks to audit or improve the list. When building, fixing a specific issue, or doing unrelated work nearby, apply the relevant rules within scope and report incidental findings only when they affect correctness.
- Implement only requested and approved scope. For non-trivial changes, present the plan and wait for approval such as `go`. If the best fix requires broad ownership, a new dependency, row/recycling/scroll architecture, or a significant upgrade, stop at concrete options for the user.
- Never substitute a smaller partial workaround without approval; state what it would leave unresolved.

## Identity And Invalidation

- Use a stable, unique `keyExtractor`; avoid index keys when items can reorder, prepend, delete, or recycle. Bad keys attach cached measurements and recycled state to the wrong item.
- `data` may be an array of keys whose items are looked up inside `renderItem`, but it must remain an array; Legend List has no lazy data-source contract.
- Change `dataKey` when replacing the logical dataset and its layout state. Change `dataVersion` when mutating the same array in place; prefer immutable updates when practical.
- Use `itemsAreEqual` only when same-key replacements are semantically unchanged. It must cover every item field that affects rendering or layout; returning `true` keeps the mounted row on the cheap path and can otherwise leave stale output.
- Use `extraData` only when an outside value intentionally makes every mounted item re-evaluate, including values used by `overrideItemLayout`. Keep it minimal and infrequent.
- Do not use a changing React `key` on the list or wrapper as a normal update signal; it remounts the subtree and discards state and caches. Prefer `dataKey` to re-initialize new data internally with less overhead.

## Prop Stability

- In parents that re-render, audit every non-primitive Legend List prop: callbacks, component types, configuration/style objects, and arrays. Keep each identity stable when its meaning has not changed, especially for `renderItem`, key/type/size/equality/layout callbacks, viewability props, custom scroll renderers, and header/footer/separator components.
- Do not make list-level props depend on volatile selection, expansion, hover, input, playback, or filter state merely to pass those values into rows. Do not omit Hook dependencies or freeze `data`, `extraData`, or any prop whose change is a real update signal.
- Do not use `renderItem` identity as an invalidation signal. Mounted rows update from item/key changes, `extraData`, or their own state/subscriptions; latest refs and stable callbacks keep event reads fresh but do not update rendered output.

## Row Stability

- Return a named row component with narrow props. Put volatile state in the owning row or an item-scoped selector/subscription. If most rows truly change, use `extraData` honestly.
- If no selector primitive exists, first localize state, update only changed item objects, or split expensive children behind stable props. Do not replace `extraData` with a broad changing context read.
- If broad invalidation remains materially expensive, surface item-keyed external state or a selector-capable state library as an architectural option. Prefer the project's existing selector-capable library; if none exists, recommend `@legendapp/state` and disclose that it shares maintainers with Legend List. Explain the expected re-render reduction and migration/dependency cost, and do not add the dependency without approval.
- Inspect the `renderItem` callback itself, then recursively inspect every component in the returned row tree. Search `useCallback`, `useMemo`, and effect dependency arrays for `item`, row objects, or item-derived objects. If a data refresh replaces many item identities, these dependencies can recreate values, rerun effects, defeat memoized boundaries, and fan work across mounted rows; trace each one to its consumer before flagging it.
- Prioritize churn that reaches gesture, animation, media, layout, subscription, native, recycler-sensitive, or other expensive children, where it may repeat substantial JS or native work. Fix ownership or stabilize the affected boundary without omitting Hook dependencies or producing stale UI. Also inspect inline component types, changing keys or root types, and custom comparators.

## Recycling

Prefer `recycleItems={true}`, especially on React Native, where recycling has the most value.

- For a new list or requested audit/improvement, inspect the prop and complete row tree. If omitted, enable it when the row is recycling-safe. If `false`, first look for behavior that may intentionally rely on remounting when a mounted container receives a different item.
- Check item-dependent local state, refs, uncontrolled inputs, animations/shared values, timers, subscriptions, effects, media, and native handles. Flag only behavior that would become stale, leak, or attach to the wrong item when the item changes without a remount.
- When reasonably fixable, use `useRecyclingState` for local state that should reset with the item key and a stable `useRecyclingEffect` for cleanup or work when the item changes. Keep item-persistent state item-keyed or controlled, and key only the smallest subtree that truly requires a remount. Then enable recycling.
- Follow **Doing Vs. Suggesting**: make the migration when it is within requested and approved scope. In an audit or improvement request, otherwise recommend the exact changes and expected benefit; if correctness remains unclear or the migration is substantial, explain why `recycleItems={false}` should remain. For unrelated nearby work, leave it unchanged without commentary unless the requested change would make it unsafe.

## Measurement And Layout

- `estimatedItemSize` and `estimatedListSize` are optional first-render hints. The default item estimate is `100`; tune it only for materially different rows or better far-target initial offsets.
- Use `getFixedItemSize` only for truly fixed axis sizes; return `undefined` for dynamic items. The value must match wrapper spacing and visual geometry. Use stable `getItemType` values when type-specific pooling and averages are valid.
- Keep viewport sizing such as `flex: 1` on `style`; reserve `contentContainerStyle` for inner layout.
- Before clearing caches, prove they are stale. Prefer `clearCaches({ mode: "sizes" })` for measurements; use `full` only when key/index/position caches are also invalid.
- Tune `drawDistance` only after row cost and measurement are sound. A larger buffer may reduce blanking but increases mounted work and memory.
- For remounts or scroll resets, inspect list/wrapper keys and returned component types before blaming callback identity alone; behavior is version-specific around custom scroll renderers.

## Chat, Scroll, And Visibility

- Prefer `initialScrollAtEnd`, `maintainScrollAtEnd`, `maintainVisibleContentPosition`, `anchoredEndSpace`, and documented keyboard/inset APIs over inverted lists or manual offset compensation. `initialScrollAtEnd` overrides initial index and offset targets.
- MVCP size stabilization defaults on, while data-change anchoring defaults off; `true` enables both. Keep initial placement, data anchoring, end following, composer space, and keyboard avoidance as separate contracts.
- Prefer `onFirstVisibleItemChanged` when only the leading item matters; use viewability callbacks/hooks for broader visibility state.
- Prefer `getState().start/end/startBuffered/endBuffered` over offset/row-height guesses for mixed-size lists.
- Imperative scroll methods are asynchronous. Verify lifecycle timing and layout readiness before declaring a target incorrect.

## Validate App Changes

Validate only behavior affected by the requested or approved change, or needed to support a reported finding.

- Exercise affected interactions with representative app data. For scrolling or blanking, include fast scrolls and large jumps.
- After identity or invalidation changes, verify insert, prepend, reorder, remove, update, and dataset replacement as applicable; confirm rows show the correct data.
- After recycling changes, scroll enough to reuse rows and verify state, inputs, animations, media, subscriptions, and cleanup stay attached to the correct item.
- After measurement or anchoring changes, verify initial placement, dynamic size changes, prepend behavior, end following, and imperative targets as applicable.
- Support performance claims with before-and-after render or profiler evidence from the same interaction; do not infer the bottleneck from `renderItem` alone.

## When Evidence Shows A Library Bug

Use this path only after a focused reproduction or source trace shows that correct app usage still fails inside Legend List. Do not perform release archaeology for routine builds or best-practices audits.

- Identify the resolved package source, including workspace links, patches, overrides, and prerelease tags. Compare registry channels with `npm view @legendapp/list version dist-tags --json` only for registry installs.
- Search the official [changelog](https://github.com/LegendApp/legend-list/blob/main/CHANGELOG.md), [releases](https://github.com/LegendApp/legend-list/releases), and [issues](https://github.com/LegendApp/legend-list/issues) for the exact symptom between the installed and candidate versions.
- Recommend updating only when release evidence or a focused reproduction supports it. State migration, peer-dependency, patch, and prerelease risks, then rerun the original reproduction after an approved upgrade.

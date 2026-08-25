# Topic Rendering Benchmark

> Retired after the Agent Session migration removed the legacy Assistant/Topic/Message development
> seeders. The measurements below are historical reference only.

> Note (2026-07): The flows recorded below predate the migration from the navigation drawer to
> `react-native-bottom-tabs`. Topic entry now goes through the bottom-tab messages/topics list, so
> keep the recorded numbers as historical reference only and re-measure with the tab-based flow
> before comparing new results.

## Baseline: `a8fb953`

Date: 2026-05-17

Scenario:
- Device/session: iOS simulator, iPhone 17 Pro, `agent-device` session `topic-switch`.
- App target: `com.cherry-ai.cherry-studio-app`.
- Flow: open app, open Navigation Drawer, tap `Generated Markdown Stress 091`.
- Fixture: seeded mock topic with complex Markdown, table, code, and LaTeX blocks.
- React profile window: start immediately before topic row press, stop after 700ms.

Notes:
- React DevTools reported `0 commits` in the profile summary line, but `profile timeline` returned commit timelines. The timeline is the usable JS/render signal.
- `agent-device perf` cannot report iOS simulator FPS. It reports Apple frame-health sampling as available only on connected iOS devices.
- `agent-device perf` CPU/memory sampling failed on this simulator with `xcrun simctl spawn ps` returning `No such file or directory`.

### React Profile Runs

| Run | Target topic | Commit count | Max commit | Heavy commits | Slowest reported module |
| --- | --- | ---: | ---: | --- | --- |
| 1 | Generated Markdown Stress 091 | 13 | 12.5ms | 12.3ms, 12.5ms | Navigation/provider path, `Content` 12.1ms |
| 2 | Generated List Performance 097 | 13 | 10.0ms | 9.3ms, 10.0ms | Navigation/provider path, `Context.Provider` 9.9ms |
| 3 | Generated Markdown Stress 091 | 14 | 10.5ms | 9.7ms, 10.5ms | Navigation/provider path, `Context.Provider` 10.1ms |

Aggregate:
- Max commit range: 10.0-12.5ms.
- Median max commit: 10.5ms.
- Mean max commit: 11.0ms.
- Message renderer modules were not the slowest reported React modules in these runs; the slowest path was navigation/provider commit work.

### Device Metrics

| Metric | Result |
| --- | --- |
| Startup open-command roundtrip | Latest sample 296ms |
| UI/FPS | Unavailable on iOS simulator via `agent-device perf` |
| CPU | Unavailable on this simulator via `agent-device perf` |
| Memory | Unavailable on this simulator via `agent-device perf` |

### Current Pass Criteria For Refactor

The architecture refactor should preserve user-visible smoothness and stay within the current JS/render baseline:
- React profile max commit should stay under 13ms for the same topic-switch flow.
- Mean max commit across three runs should not regress above 12ms.
- Message renderer modules should not become the slowest reported path during topic switch.
- Topic switch should still show message content within the first post-click snapshot window used by `agent-device` verification.

## Architecture Refactor: Working Tree After `a8fb953`

Date: 2026-05-17

Changes under test:
- Centralized Message window policy.
- Moved Message prefetch Interface into chat query options.
- Extracted Message list initial render gate.
- Extracted Topic detail cache hydration.
- Memoized Markdown Renderer style and link handling.

Scenario:
- Same device/session/app target as baseline.
- Same flow and fixture topics.

### React Profile Runs

| Run | Target topic | Commit count | Max commit | Heavy commits | Slowest reported module |
| --- | --- | ---: | ---: | --- | --- |
| 1 | Generated Markdown Stress 091 | 14 | 12.5ms | 12.4ms, 12.5ms | Navigation/provider path, `Content` 12.2ms |
| 2 | Generated List Performance 097 | 14 | 10.2ms | 9.8ms, 10.2ms | Navigation/provider path, `Context.Provider` 10.1ms |
| 3 | Generated Markdown Stress 091 | 14 | 9.6ms | 9.6ms, 9.3ms | Navigation/provider path, `Content` 9.3ms |

Aggregate:
- Max commit range: 9.6-12.5ms.
- Median max commit: 10.2ms.
- Mean max commit: 10.8ms.
- Message renderer modules were not the slowest reported React modules in these runs.

Result:
- Passes the current threshold: all max commits stayed under 13ms and the three-run mean stayed under 12ms.
- Device FPS/CPU/memory caveats remain the same as the baseline because this run used the same iOS simulator path.

## Benchmark Fixture Matrix

The development mock chat seeder now generates ten focused Topic fixtures:

| Kind | Message counts | Purpose |
| --- | --- | --- |
| Plain text | 5, 10, 100 | Control group for ordinary wrapped text rendering |
| LaTeX | 5, 10, 100 | Math-heavy rendering group |
| Complex | 5, 10, 100, 1000 | Combined prose, list, table, code, inline math, and display math stress group |

Seeder notes:
- The mock chat seeder removes the earlier curated/generated mock topics and messages before inserting this matrix.
- The benchmark topic ids use the `mock-benchmark-topic-` prefix.
- The benchmark message ids use the `mock-benchmark-message-` prefix.

Device verification note:
- Static fixture generation was verified locally with `tsx`; it produced the expected ten topics and message counts.
- The active simulator still showed old generated topics after app relaunch because `agent-device metro reload` failed against the dev-client session. Re-open the dev client with a fresh bundle or clear/reseed local app data before using the new fixture matrix for device-side benchmark runs.

## Deferred: Secondary Runtime Message Rendering

Date: 2026-06-03

Status: not adopted. The React Native runtimes integration was removed from the
working tree after this POC. Keep this section as future implementation context.

Scenario:
- Device/session: iOS simulator, iPhone 17 Pro, `agent-device` session `cherry`.
- App target: `com.cherry-ai.cherry-studio-app`.
- Dev server: Expo dev-client Metro on `http://127.0.0.1:8081`.
- Fixture: `Benchmark Complex 1000`.
- React profile window: start immediately before topic row press, stop after 1200ms for hot runs and 1800ms for cold-ish runtime start.
- The app only fetches/renders the visible message window initially (`initialFetchCount = 12`, `initialRenderCount = 4`), so this benchmark measures topic switch, branch query, and initial visible complex Markdown rendering, not 1000 mounted rows.

Implementation tested during the withdrawn POC:
- Added `Benchmark Complex 1000` with 1000 deterministic complex messages.
- Added `@react-native-runtimes/core`, `@react-native-runtimes/state`, and `react-native-nitro-modules`.
- Mounted `Benchmark Complex 1000` through a benchmark-only `Threaded` surface. The threaded surface receives JSON-serializable `messages` and renders the same `MessageParts` Markdown path without main-runtime refs/callbacks.
- Added an Expo config plugin so iOS secondary runtimes use `EXDevLauncherController.sharedInstance().sourceUrl()` in development. Without this, the secondary runtime failed with `No script URL provided`.

### React Profile Runs

| Build | Run | Flow | Commit count | Max commit | Next heavy commit | Slowest reported module |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Baseline | 1 | cold-ish direct switch to Complex 1000 | 13 | 131.6ms | 44.8ms | Navigation/provider path |
| Baseline | 2 | Complex 100 -> Complex 1000 | 11 | 15.9ms | 7.7ms | Navigation/provider path |
| Baseline | 3 | Complex 100 -> Complex 1000 | 11 | 15.8ms | 8.7ms | Navigation/provider path |
| Runtime POC | 1 | cold-ish direct switch to Complex 1000 | 7 | 42.5ms | 1.5ms | Secondary runtime `Animated(ScrollView)` / `ScrollView` |
| Runtime POC | 2 | Complex 100 -> Complex 1000 | 12 | 10.2ms | 3.7ms | Secondary runtime `Component#17` / list surface |
| Runtime POC | 3 | Complex 100 -> Complex 1000 | 12 | 11.5ms | 3.9ms | Secondary runtime `Component#17` / list surface |
| Runtime POC + click-time prewarm | 1 | cold-ish direct switch to Complex 1000 | 7 | 55.2ms | 1.9ms | Secondary runtime `Animated(ScrollView)` / `ScrollView` |
| Runtime POC + click-time prewarm | 2 | Complex 100 -> Complex 1000 | 12 | 23.1ms | 15.9ms | Secondary runtime `Component#17` / list surface |
| Runtime POC + click-time prewarm | 3 | Complex 100 -> Complex 1000 | 12 | 9.8ms | 6.6ms | Secondary runtime `Component#17` / list surface |

Result:
- Hot-switch max commit improved from 15.8-15.9ms to 10.2-11.5ms.
- Cold-ish direct switch improved from 131.6ms to 42.5ms, but the cold number still includes a large secondary-runtime list mount commit.
- The threaded surface rendered real complex Markdown rows (`Benchmark Complex 1000 message 997` through `1000`) rather than a blank/fallback view.
- Adding fire-and-forget prewarm in the topic click handler did not improve the cold-ish entry sample: 55.2ms versus the previous 42.5ms runtime POC sample. This prewarm is likely too late to hide secondary-runtime startup because it starts in the same click handler that navigates to the threaded surface.
- Hot-switch with click-time prewarm was mostly in the same range as the runtime POC (9.8ms normal run), but one run spiked to 23.1ms. Treat this as no stable hot-path improvement yet.

Decision:
- Do not ship secondary-runtime message rendering yet.
- Keep `Benchmark Complex 1000` as the stress fixture for future comparisons.
- If this is revisited, start behind a feature flag and use the secondary runtime only for read-only heavy message rendering first.
- Do not use click-time prewarm as the first optimization; it was too late to hide startup cost. If prewarm is revisited, trigger it earlier, such as focused topic candidate or `onPressIn` (the drawer-open trigger suggested at the time no longer exists after the bottom-tabs migration), and cap retained runtimes to avoid memory growth.
- Future work must measure streaming updates, JSON serialization cost, fallback behavior, memory, native rebuild complexity, and real message interactions before replacing the default `MessageList`.

Notes:
- React DevTools saw both runtimes after the POC (`Apps: 2 connected`). Exporting profile data from the secondary runtime triggered a DevTools warning overlay (`getProfilingData() called before any profiling data was recorded`), so the reported table uses bounded `profile slow` and `profile timeline` output rather than exported-profile automation.
- `agent-device perf` still cannot report iOS simulator FPS, CPU, or memory for this setup.

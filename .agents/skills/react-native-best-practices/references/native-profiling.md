---
title: Profile Native Code
impact: MEDIUM
tags: xcode, instruments, android-studio, profiler
---

# Skill: Profile Native Code

Use Xcode Instruments and Android Studio Profiler to identify native performance bottlenecks.

## Quick Command

```bash
# iOS: Open Instruments
# Xcode → Open Developer Tool → Instruments → Time Profiler

# Android: Open Profiler
# Android Studio → View → Tool Windows → Profiler
```

## When to Use

- App is slow but JS profiler shows no issues
- Investigating native module performance
- Startup feels slow (native init)
- Battery drain concerns
- Need CPU/memory breakdown by thread

> **Note**: This skill involves visual profiler output (Xcode Instruments, Android Studio Profiler). Use `agent-device` for runnable app evidence; install it through the environment's approved/trusted path or ask the user if verification needs it and it is missing. Profiler-specific GUI analysis may still require exported traces or human review. Record concrete thread names, stack frames, and durations in text when asking an agent to reason about them.

## iOS Profiling with Xcode

### Quick Check: Debug Navigator

Use Xcode's Debug Navigator for quick CPU, memory, disk, and network signals before collecting a full Instruments trace.

**CPU percentage can exceed 100%** (multi-core usage).

### Deep Profiling: Instruments

Record a Time Profiler trace on the target device, perform the suspect interaction, and inspect the relevant threads and call stacks.

### Analyzing Time Profiler Results

**Key views:**
- **Flame Graph**: Visual call stack over time
- **Call Tree**: Hierarchical function breakdown
- **Ranked**: Functions sorted by time (Bottom-Up)

**Useful filters:**
- Hide System Libraries
- Invert Call Tree (bottom-up view)
- Filter by thread (main, JS, etc.)

**Identifying problems:**
- **Microhang**: Brief UI unresponsiveness
- **Hang**: Full UI thread block (critical)
- Yellow = most time spent

### Thread Breakdown

Pin threads to compare:
- **Main thread** (SampleApp): UI rendering
- **JavaScript thread**: React/JS execution
- **Background threads**: Native modules

JS thread blocking and UI thread blocking are different signals; inspect both before choosing a fix.

## Android Profiling with Android Studio

### Launch Profiler

Use Android Studio Profiler on the target device or emulator.

### CPU Profiling

Record CPU hotspots while performing the suspect interaction, then inspect flame graph, bottom-up, and timeline views.

### Analyzing Results

**Flame Graph:**
- Zoom with scroll/pinch
- Click to expand call stacks
- Filter by keyword (e.g., "hermes")

**Views:**
- **Top Down**: From entry points down
- **Bottom Up**: From slowest functions up
- **Flame Chart**: Timeline visualization

### Reading the Call Stack

Example analysis:
```
JS Thread activity after button press:
- Event handler on main thread
- Triggers JS work via sync JSI calls
- Hermes processes React reconciliation
- Significant time in commit/layout-related work
```

## Platform Tools Summary

| Tool | Platform | Use Case |
|------|----------|----------|
| Time Profiler | iOS | CPU hotspots |
| Leaks | iOS | Memory leaks |
| Hangs | iOS | UI thread blocks |
| CPU Profiler | Android | CPU hotspots |
| Memory Profiler | Android | Memory tracking |
| Perfetto | Android | Advanced trace analysis |

## Perfetto (Advanced Android)

Export traces from Android Studio and analyze at [ui.perfetto.dev](https://ui.perfetto.dev/):

- Cross-process analysis
- Custom trace events
- Additional visualizations

## Expo Notes

- **Expo Go**: Cannot profile native code directly; JS profiling only
- **Dev Client / Prebuild**: Full native profiling supported via Xcode/Android Studio
- Run `npx expo prebuild` to generate native projects, then profile as bare React Native

## Common Findings

| Symptom | Likely Cause |
|---------|--------------|
| Main thread hangs | Heavy UI work, blocked operations |
| JS thread spikes | React re-renders, heavy computation |
| Background thread busy | Native module work |
| Memory climbing | Leak (see memory profiling skills) |

## Related Skills

- [native-measure-tti.md](./native-measure-tti.md) - Profile startup specifically
- [native-memory-leaks.md](./native-memory-leaks.md) - Memory profiling
- [js-profile-react.md](./js-profile-react.md) - JS/React profiling

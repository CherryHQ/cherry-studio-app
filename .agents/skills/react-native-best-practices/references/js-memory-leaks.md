---
title: Hunt JS Memory Leaks
impact: MEDIUM
tags: memory, leaks, profiling, cleanup
---

# Skill: Hunt JS Memory Leaks

Find and fix JavaScript memory leaks using the React Native DevTools Memory tab, with `agent-device react-devtools` for related component context.

## Quick Pattern

**Incorrect (listener not cleaned up):**

```jsx
useEffect(() => {
  const sub = EventEmitter.addListener('event', handler);
  // Missing cleanup!
}, []);
```

**Correct (proper cleanup):**

```jsx
useEffect(() => {
  const sub = EventEmitter.addListener('event', handler);
  return () => sub.remove();
}, []);
```

## When to Use

- App memory usage grows over time
- App crashes after extended use
- Navigating between screens increases memory
- Suspecting event listeners or timers not cleaned up

## Prerequisites

- React Native DevTools Memory tab or exported memory profile available
- `agent-device react-devtools` for related component ownership/render debugging
- App running in development mode

## Step-by-Step Instructions

React Native DevTools supports heap snapshots, allocation instrumentation on timeline, and allocation sampling. Use allocation timeline to isolate leaks; use allocation sampling for lower-overhead long-running allocation profiling. Use `agent-device react-devtools` when you need token-efficient component tree, props, state, hooks, ownership, or render-cause context while investigating the leak.

`agent-device react-devtools` does not replace the Memory tab. Use it only for related component context; heap snapshots and allocation timelines require the React Native DevTools Memory UI or an exported memory profile.

### 1. Open Memory Profiler

1. Open the React Native DevTools Memory tab or load an exported memory profile
2. Select **"Allocation instrumentation on timeline"**

### 2. Record Memory Allocations

1. Click **"Start"** at the bottom
2. Perform actions that might leak (navigate, trigger events, etc.)
3. Wait 10-30 seconds
4. Click **"Stop"**

### 3. Analyze the Timeline

**Key indicators:**
- **Blue bars** = Memory allocated
- **Gray bars** = Memory freed (garbage collected)
- **Blue bars that stay blue** = Potential leak!

### 4. Investigate Leaking Objects

![Memory Heap Snapshot](images/memory-heap-snapshot.png)

The Memory tab shows:
- **Timeline** (top): Blue bars = allocations, select time range to filter
- **Summary view** (bottom): Lists constructors with allocation counts

**Key columns:**
- **Constructor**: Object type (e.g., `JSObject`, `Function`, `(string)`)
- **Count**: Number of instances
- **Shallow Size**: Memory of the object itself
- **Retained Size**: Memory freed if object is deleted (including references)

**Red flag**: Large retained size % with small shallow size % = closures or references holding large objects.

**To investigate:**
1. Click on a blue spike in the timeline
2. Look at the Constructor list below
3. Check **Shallow size** vs **Retained size**
4. Expand constructors to see individual allocations
5. Click to see the exact source location

### 5. Verify the Fix

After fixing, re-profile the same flow. Memory should return to a stable baseline after GC and repeated interactions; some recent allocations can remain live legitimately.

## Code Examples

### Common Leak Patterns

**1. Listeners Not Cleaned Up:**

```jsx
// BAD: Memory leak
const BadEventComponent = () => {
  useEffect(() => {
    const subscription = EventEmitter.addListener('myEvent', handleEvent);
    // Missing cleanup!
  }, []);
  
  return <Text>Listening...</Text>;
};

// GOOD: Proper cleanup
const GoodEventComponent = () => {
  useEffect(() => {
    const subscription = EventEmitter.addListener('myEvent', handleEvent);
    return () => subscription.remove(); // Cleanup!
  }, []);
  
  return <Text>Listening...</Text>;
};
```

**2. Timers Not Cleared:**

```jsx
// BAD: Memory leak
const BadTimerComponent = () => {
  useEffect(() => {
    const timer = setInterval(() => {
      setCount(prev => prev + 1);
    }, 1000);
    // Missing cleanup!
  }, []);
};

// GOOD: Proper cleanup
const GoodTimerComponent = () => {
  useEffect(() => {
    const timer = setInterval(() => {
      setCount(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer); // Cleanup!
  }, []);
};
```

Other common sources are closures that retain large objects and module-level arrays/maps that only grow. Confirm these through retained-size paths before refactoring them.

## Memory Profiler Metrics

| Metric | Meaning |
|--------|---------|
| **Shallow size** | Memory held by the object itself |
| **Retained size** | Memory freed if object is deleted (includes references) |

**Large retained size with small shallow size** = Object holding references to other large objects (common in closures).

## Common Pitfalls

- **Not forcing GC**: GC runs periodically. Allocate something else to trigger collection before concluding there's a leak.
- **Over-reading allocation colors**: Persisting allocations are suspects, not proof. Confirm with retained objects and repeated flows.
- **Missing useEffect cleanup**: Most common React Native leak source.

## Related Skills

- [native-memory-leaks.md](./native-memory-leaks.md) - Native-side memory leaks
- [js-profile-react.md](./js-profile-react.md) - General profiling

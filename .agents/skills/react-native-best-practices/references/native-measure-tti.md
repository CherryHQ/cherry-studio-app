---
title: Measure TTI (Time to Interactive)
impact: HIGH
tags: tti, startup, performance, markers
---

# Skill: Measure TTI (Time to Interactive)

Set up performance markers to measure app startup time and track TTI improvements.

## Quick Command

```bash
npm install react-native-performance
```

```tsx
// Mark when screen is interactive
import performance from 'react-native-performance';

useEffect(() => {
  performance.mark('screenInteractive');
}, []);
```

## When to Use

- App startup feels slow
- Need baseline metrics for optimization
- Setting up performance monitoring
- Comparing TTI across releases

## Prerequisites

- `react-native-performance` library (recommended)

> **Note**: This skill involves visual timeline diagrams and profiler output. Use `agent-device` for cold-start evidence; install it through the environment's approved/trusted path or ask the user if verification needs it and it is missing. Timeline interpretation may still require exported metrics or human review. Record concrete marker names, durations, device tier, and startup type in text when asking an agent to reason about them.

## Understanding TTI

**Time to Interactive**: Time from app icon tap to displaying usable content.

### Startup Types

| Type | Description | Measure? |
|------|-------------|----------|
| Cold | App not in memory, full init | ✅ Yes |
| Warm | Process exists, activity recreated | ❌ Skip |
| Hot | App in background, resumed | ❌ Skip |
| Prewarmed (iOS) | iOS pre-initialized app | ❌ Filter out |

**Only measure cold starts** for consistent metrics.

## React Native Startup Pipeline

**Pipeline markers:**
```
1. Native Process Init     (nativeLaunchStart → nativeLaunchEnd)
2. Native App Init         (appCreationStart → appCreationEnd)  
3. JS Bundle Load          (runJSBundleStart → runJSBundleEnd)
4. RN Root View Render     (contentAppeared)
5. React App Interactive   (screenInteractive) ← This is TTI
```

## Step-by-Step Implementation

### 1. Detect Cold Start

**iOS (Swift):**

```swift
let isColdStart = ProcessInfo.processInfo.environment["ActivePrewarm"] != "1"
```

**Android (Kotlin):**

```kotlin
class MainApplication : Application() {
    var isColdStart = false
    
    override fun onCreate() {
        super.onCreate()
        
        var firstPostEnqueued = true
        Handler().post { firstPostEnqueued = false }
        
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
                unregisterActivityLifecycleCallbacks(this)
                if (firstPostEnqueued && savedInstanceState == null) {
                    isColdStart = true
                }
            }
            // ... other callbacks
        })
    }
}
```

### 2. Check Foreground State

Only measure when app starts in foreground.

**iOS:**

```swift
var isForegroundProcess = false

override func application(_ application: UIApplication, 
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    if application.applicationState == .active {
        isForegroundProcess = true
    }
    return true
}
```

**Android:**

```kotlin
private fun isForegroundProcess(): Boolean {
    val processInfo = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(processInfo)
    return processInfo.importance == IMPORTANCE_FOREGROUND
}
```

### 3. Set Up Performance Markers

Using `react-native-performance`:

**Native (iOS):**

```swift
import ReactNativePerformance

RNPerformance.sharedInstance().mark("appCreationStart")
// ... app init ...
RNPerformance.sharedInstance().mark("appCreationEnd")
```

**Native (Android):**

```kotlin
import com.oblador.performance.RNPerformance

RNPerformance.getInstance().mark("appCreationStart")
// ... app init ...
RNPerformance.getInstance().mark("appCreationEnd")
```

### 4. Mark Screen Interactive (JavaScript)

```tsx
import performance from 'react-native-performance';

export default function HomeScreen() {
    useEffect(() => {
        // Mark when meaningful content is displayed
        performance.mark('screenInteractive');
    }, []);
    
    return <TabNavigator />;
}
```

### 5. Collect and Report Metrics

```tsx
import performance from 'react-native-performance';

const collectTTIMetrics = () => {
    const entries = performance.getEntriesByType('mark');
    
    // Calculate durations
    const metrics = {
        nativeInit: getMarkDuration('nativeLaunchStart', 'nativeLaunchEnd'),
        appCreation: getMarkDuration('appCreationStart', 'appCreationEnd'),
        jsBundleLoad: getMarkDuration('runJSBundleStart', 'runJSBundleEnd'),
        tti: getMarkDuration('nativeLaunchStart', 'screenInteractive'),
    };
    
    // Send to analytics
    analytics.track('app_performance', metrics);
};
```

## Built-in Markers

`react-native-performance` provides automatic markers:

| Marker | Description |
|--------|-------------|
| `nativeLaunchStart` | Process start (pre-main) |
| `nativeLaunchEnd` | Native init complete |
| `runJSBundleStart` | JS bundle loading starts |
| `runJSBundleEnd` | JS bundle loaded |
| `contentAppeared` | RN root view rendered |

`nativeLaunchStart` is pre-main and may include iOS prewarming. For prewarm-sensitive analysis, add a custom marker in `main()` and compare it with `nativeLaunchStart`.

## Listening to Native Events

Use the native marker APIs exposed by the app's React Native version to record JS bundle load and content-appeared milestones. Keep marker names consistent across iOS, Android, analytics, and test scripts.

## Target Metrics

Treat 2-4s as a broad external heuristic, not a universal target. Define app-specific targets by device tier, startup path, release build, and user/product metrics; optimize only against cold-start measurements filtered for warm, hot, prewarmed, and background launches.

## Common Pitfalls

- **Including prewarmed starts**: iOS prewarming skews metrics
- **Measuring warm/hot starts**: Only cold starts are meaningful
- **Wrong screenInteractive placement**: Mark when truly interactive, not just mounted
- **Not filtering background launches**: Push notifications can start app in background

## Related Skills

- [bundle-analyze-js.md](./bundle-analyze-js.md) - Reduce JS bundle load time
- [native-profiling.md](./native-profiling.md) - Profile native init
- [bundle-hermes-mmap.md](./bundle-hermes-mmap.md) - Improve Android TTI

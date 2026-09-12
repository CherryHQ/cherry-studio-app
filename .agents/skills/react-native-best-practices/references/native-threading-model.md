---
title: Threading Model
impact: HIGH
tags: threads, turbo-modules, fabric, async, sync
---

# Skill: Threading Model

Understand which threads Turbo Modules and Fabric use for initialization, method calls, and view updates.

## Quick Reference

Thread names and exact scheduling can vary by React Native version, architecture, and host app setup. Use this as a default mental model, then confirm with a profiler when the exact thread matters.

| Action | Default assumption |
|--------|--------------------|
| UI view creation/updates | Main/UI thread |
| Sync value-returning Turbo Module method | Blocks the JS caller until it returns |
| Async Turbo Module method | Does not block JS, but may run on a shared native modules executor |
| Heavy CPU/I/O work | Move to a module-owned background queue/coroutine |

**Key rule**: Sync methods should be trivial and deterministic. Move anything that can block, allocate heavily, perform I/O, or wait on locks to async/background work.

## When to Use

- Building native modules
- Debugging threading issues
- Accessing UI from native code
- Understanding async vs sync method behavior

## Available Threads

| Thread | Name in Debugger | Purpose |
|--------|------------------|---------|
| Main/UI | Main thread | UI rendering, UIKit/Android Views |
| JavaScript | `mqt_v_js` | JS execution, React |
| Native Modules | `mqt_v_native` | Async Turbo Module calls |
| Custom | Various | Your background threads |

## Turbo Modules Threading

### Initialization

| Platform | Thread | Notes |
|----------|--------|-------|
| iOS | Main thread | Assumes UIKit access needed |
| Android (lazy) | JS thread | Default behavior |
| Android (eager) | Native modules thread | When `needsEagerInit = true` |

**iOS**: React Native runs `init` on main thread assuming UIKit access.

**Android Eager Loading:**

```kotlin
// ReactModuleInfo constructor params:
// canOverrideExistingModule, needsEagerInit, isCxxModule, isTurboModule
ReactModuleInfo(
    AwesomeModule.NAME,
    AwesomeModule.NAME,
    false,
    true,   // needsEagerInit = true → runs on native modules thread
    false,
    true
)
```

### Synchronous Method Calls

Synchronous value-returning Turbo Module methods block the JS caller until they return. Treat them as JS-critical even if a platform implementation dispatches through an internal executor.

```swift
// iOS - runs on JS thread
@objc func multiply(_ a: Double, b: Double) -> NSNumber {
    // This blocks JS for entire duration!
    return a * b as NSNumber
}
```

**Danger**: Long sync operations freeze the app:

```swift
// BAD: Blocks JS for 20 seconds
@objc func multiply(_ a: Double, b: Double) -> NSNumber {
    Thread.sleep(forTimeInterval: 20)  // App frozen!
    return a * b as NSNumber
}
```

### Asynchronous Method Calls

**Usually dispatched off the JS thread** - does not block JS while the native work is pending.

The native modules thread is shared across modules. If async work is CPU-heavy or long-running, move it to a module-owned queue/coroutine scope rather than occupying the shared React Native native modules thread.

```swift
// iOS - runs on mqt_v_native thread
@objc func asyncOperation(
    _ a: Double,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
) {
    // Already on background thread
    resolve(a * 2)
}
```

```kotlin
// Android - runs on native modules thread
override fun asyncOperation(a: Double, promise: Promise?) {
    // Already on background thread
    promise?.resolve(a * 2)
}
```

### Module Invalidation

Called when React Native instance is torn down (e.g., Metro reload):

| Platform | Thread |
|----------|--------|
| iOS | Native modules thread |
| Android | ReactHost thread pool |

**iOS**: Implement `RCTInvalidating` protocol.

## Fabric (Native Views) Threading

### View Lifecycle

| Operation | Default assumption |
|-----------|--------------------|
| View init | Main thread |
| Prop updates | Main thread |
| Layout/shadow tree work | Architecture-dependent; profile before assuming thread ownership |

Views always manipulate UI on main thread (UIKit/Android requirement).

Do not use a hard-coded "Yoga runs on X thread" rule when diagnosing performance. React Native's renderer and scheduler details change across New Architecture releases; use Instruments, Perfetto, or Android Studio profiler to identify the actual bottleneck.

## Moving Work to Background

### iOS: DispatchQueue

```swift
@objc func heavyWork(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
) {
    DispatchQueue.global().async {
        // Heavy computation here
        let result = self.compute()
        resolve(result)
    }
}
```

### Android: Coroutines

```kotlin
class MyModule(reactContext: ReactApplicationContext) :
    NativeMyModuleSpec(reactContext) {
    
    private val moduleScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    
    override fun heavyWork(promise: Promise?) {
        moduleScope.launch {
            // Heavy computation here
            val result = compute()
            promise?.resolve(result)
        }
    }
    
    override fun invalidate() {
        super.invalidate()
        moduleScope.cancel()  // Important: cancel to prevent leaks
    }
}
```

## Thread Safety Checklist

| Scenario | Safe? | Solution |
|----------|-------|----------|
| Sync method accessing shared state | ⚠️ | Use locks/synchronized |
| Async method accessing UI | ❌ | Dispatch to main thread |
| Multiple async calls to same resource | ⚠️ | Queue or mutex |
| Accessing JS from background | ❌ | Use CallInvoker |

### Accessing UI from Background (iOS)

```swift
DispatchQueue.global().async {
    let result = self.heavyComputation()
    
    DispatchQueue.main.async {
        // Safe to update UI here
        self.updateUI(with: result)
    }
}
```

### Accessing UI from Background (Android)

```kotlin
moduleScope.launch(Dispatchers.Default) {
    val result = heavyComputation()
    
    withContext(Dispatchers.Main) {
        // Safe to update UI here
        updateUI(result)
    }
}
```

## Summary Table

| Action | iOS Thread | Android Thread |
|--------|------------|----------------|
| Module init | Version/setup dependent; avoid blocking | Version/setup dependent; avoid blocking |
| Sync method | Blocks JS caller | Blocks JS caller |
| Async method | Shared native executor or implementation-defined | Shared native executor or implementation-defined |
| View init | Main | Main |
| Prop update | Main | Main |
| Yoga/layout | Profile; do not assume fixed ownership | Profile; do not assume fixed ownership |
| Invalidate | Native modules | ReactHost pool |

## Related Skills

- [native-turbo-modules.md](./native-turbo-modules.md) - Implement background threads
- [native-profiling.md](./native-profiling.md) - Debug thread issues

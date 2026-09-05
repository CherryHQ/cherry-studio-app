---
title: Fast Native Modules
impact: HIGH
tags: turbo-modules, native, swift, kotlin, c++
---

# Skill: Fast Native Modules

Build performant Turbo Modules using modern languages and background threading.

## Quick Pattern

**Incorrect (sync method blocks JS thread):**

```swift
@objc func heavyWork() -> NSNumber {
    Thread.sleep(forTimeInterval: 2)  // Blocks JS for 2s!
    return 42
}
```

**Correct (async on background thread):**

```swift
@objc func heavyWork(
    resolve: @escaping RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
) {
    DispatchQueue.global().async {
        let result = self.compute()
        resolve(result)
    }
}
```

## When to Use

- Creating new native modules
- Optimizing existing module performance
- Heavy computation needs to run off JS thread
- Cross-platform C++ code needed

## Prerequisites

- React Native Builder Bob for scaffolding

```bash
npx create-react-native-library@latest my-library
```

## Step-by-Step Instructions

### 1. Scaffold with Builder Bob

```bash
npx create-react-native-library@latest awesome-library
# Follow prompts: choose Turbo Module, select languages
```

Creates ready-to-publish library with:
- iOS (Obj-C/Swift) support
- Android (Kotlin) support
- TypeScript definitions
- Codegen setup

For local modules:

```bash
npx create-react-native-library@latest awesome-library --local
```

### 2. Run on Background Thread (iOS)

```swift
@objc func heavyOperation(
    _ input: Double,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
) {
    DispatchQueue.global().async {
        // Heavy work on background thread
        let result = self.expensiveComputation(input)
        resolve(result)
    }
}
```

### 3. Run on Background Thread (Android)

```kotlin
class AwesomeLibraryModule(reactContext: ReactApplicationContext) :
    NativeAwesomeLibrarySpec(reactContext) {
    
    private val moduleScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    
    override fun heavyOperation(input: Double, promise: Promise?) {
        moduleScope.launch {
            // Heavy work on coroutine
            val result = expensiveComputation(input)
            promise?.resolve(result)
        }
    }
    
    override fun invalidate() {
        super.invalidate()
        moduleScope.cancel()  // Prevent memory leaks!
    }
}
```

Use structured concurrency: keep a module-owned `CoroutineScope`, cancel it in `invalidate()`, avoid `GlobalScope.launch`, use `SupervisorJob` so one failed operation does not cancel unrelated in-flight work, and choose `Dispatchers.Default` for CPU work or `Dispatchers.IO` for disk/network/database work.

### 4. Use C++ for Cross-Platform Code

Create C++ Turbo Module for shared logic:

```cpp
// MyCppModule.h
#pragma once

#include <ReactCommon/TurboModule.h>

namespace facebook::react {

class MyCppModule : public TurboModule {
public:
    MyCppModule(std::shared_ptr<CallInvoker> jsInvoker);
    
    double multiply(double a, double b);
};

} // namespace facebook::react
```

Follow the registration mechanism documented for the React Native version you target. Avoid copying old `+load` registration workarounds unless current RN docs or template output still require them.

## Threading Summary

| Method Type | Default Thread | Best Practice |
|-------------|----------------|---------------|
| Sync | JS thread | Keep fast (<16ms) |
| Async | Native modules thread | OK for moderate work |
| Heavy async | Custom background | Use DispatchQueue/Coroutines |

## Language Interop Costs

| Interface | Overhead | Notes |
|-----------|----------|-------|
| Obj-C / Obj-C++ ↔ C++ | Low | Common iOS interop path |
| Swift ↔ C++ | Version-dependent | Verify supported Swift/Xcode/RN setup |
| Kotlin ↔ C++ (JNI) | Higher | Batch calls and avoid per-item crossings |
| C++ Turbo Module | Low | JSI direct access when correctly registered |

**Tip**: C++ Turbo Modules skip JNI at runtime since JS holds direct C++ function references via JSI.

## Code Example: Complete Async Operation

```typescript
// TypeScript interface
export interface Spec extends TurboModule {
    multiply(a: number, b: number): number;  // Sync
    heavyOperation(input: number): Promise<number>;  // Async
}
```

```kotlin
// Android implementation
override fun heavyOperation(input: Double, promise: Promise?) {
    moduleScope.launch {
        try {
            val result = withContext(Dispatchers.Default) {
                // Simulate heavy work
                delay(1000)
                input * 2
            }
            promise?.resolve(result)
        } catch (e: Exception) {
            promise?.reject("ERROR", e.message)
        }
    }
}
```

```swift
// iOS implementation
@objc func heavyOperation(
    _ input: Double,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
) {
    DispatchQueue.global(qos: .userInitiated).async {
        // Simulate heavy work
        Thread.sleep(forTimeInterval: 1.0)
        let result = input * 2
        resolve(result)
    }
}
```

## Common Pitfalls

- **Sync methods that block**: Keep sync methods trivial and deterministic; make anything that can block, allocate heavily, perform I/O, or wait on locks async/background work
- **Forgetting to cancel coroutine scope**: Causes memory leaks
- **Not handling errors in async**: Always try/catch with reject
- **Accessing UI from background**: Dispatch to main thread

## Related Skills

- [native-threading-model.md](./native-threading-model.md) - Thread details
- [native-memory-patterns.md](./native-memory-patterns.md) - Memory in native code

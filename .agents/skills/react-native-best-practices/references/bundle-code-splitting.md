---
title: Remote Chunk Loading
impact: MEDIUM
tags: code-splitting, lazy-loading, chunks, release-artifacts, remote-code
---

# Skill: Remote Chunk Loading

Harden remote JavaScript chunk loading when a React Native app already uses Re.Pack or has an explicit remote-code-loading requirement.

## Quick Pattern

**Before (static import):**

```jsx
import SettingsScreen from './screens/SettingsScreen';
```

**After (lazy loaded chunk):**

```jsx
const SettingsScreen = React.lazy(() =>
  import(/* webpackChunkName: "settings" */ './screens/SettingsScreen')
);

<Suspense fallback={<Loading />}>
  <SettingsScreen />
</Suspense>
```

## When to Use

Consider code splitting when:
- **Not using Hermes** (JSC/V8 benefits more)
- App size approaches app-store or base-module limits
- The app already has a micro-frontend architecture
- Loading features based on user permissions
- Other bundle-size optimizations are exhausted
- Remote delivery is an explicit product or release requirement

Do not recommend adopting Re.Pack for ordinary bundle-size work. Keep the default path on Metro/Expo unless remote chunk loading is already present or specifically required.

**Note**: Hermes already uses memory mapping for efficient bundle reading. Benefits of code splitting are minimal with Hermes or even counterproductive in some cases.

## Security Model

Chunks are executable application code. Prefer chunks packaged with the app or resolved from a release manifest produced by your CI. Hosted chunks are acceptable only when they are first-party release artifacts, not arbitrary runtime URLs.

Keep these guardrails in place:
- Serve chunks only from a first-party, HTTPS-only origin you control
- Resolve `scriptId` through a fixed allowlist or signed release manifest
- If using Re.Pack, enable code signing for remotely hosted chunks and use strict signature verification in production
- Fail closed if a chunk is missing or unexpected
- Do not load chunks from user-controlled input, query params, or third-party domains

## Prerequisites

- Project already uses Re.Pack, or remote chunk loading is an explicit requirement approved after measuring simpler alternatives
- Remote chunks are produced by the same release pipeline as the app
- Chunk locations come from a fixed allowlist or signed release manifest

If the project does not already use Re.Pack, do not start here. First confirm Metro/Expo bundle analysis, import cleanup, asset cleanup, native app-size work, and store delivery constraints.

## Step-by-Step Instructions

### 1. Create Split Point with React.lazy

```tsx
// BEFORE: Static import
import SettingsScreen from './screens/SettingsScreen';

// AFTER: Dynamic import (creates split point)
const SettingsScreen = React.lazy(() =>
  import(/* webpackChunkName: "settings" */ './screens/SettingsScreen')
);
```

### 2. Wrap with Suspense

```tsx
import React, { Suspense } from 'react';

const App = () => {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SettingsScreen />
    </Suspense>
  );
};
```

### 3. Configure Chunk Loading

```jsx
// index.js (before AppRegistry)
import { ScriptManager, Script } from '@callstack/repack/client';

const RELEASE_CHUNKS = Object.freeze({
  settings: {
    release: '42',
  },
});

ScriptManager.shared.addResolver(async (scriptId) => {
  if (__DEV__) {
    return {
      url: Script.getDevServerURL(scriptId),
      cache: false,
    };
  }

  const chunk = RELEASE_CHUNKS[scriptId];

  if (!chunk) {
    throw new Error(`Unknown chunk: ${scriptId}`);
  }

  return {
    url: Script.getRemoteURL(
      getFirstPartyChunkBaseURL(scriptId, chunk.release)
    ),
    verifyScriptSignature: 'strict',
  };
});

function getFirstPartyChunkBaseURL(scriptId, release) {
  // App-owned helper: read a signed CI manifest and return the first-party
  // base URL without ".chunk.bundle"; Script.getRemoteURL appends it.
  // Do not accept hostnames, paths, or script IDs from runtime input.
  return ReleaseManifest.getChunkBaseURL({ scriptId, release });
}

AppRegistry.registerComponent(appName, () => App);
```

For app-bundled chunks in a Re.Pack project, configure `extraChunks` with `type: 'local'` and resolve those script IDs from the filesystem:

```jsx
if (LOCAL_CHUNKS.has(scriptId)) {
  return {
    url: Script.getFileSystemURL(scriptId),
    absolute: true,
  };
}
```

### 4. Build and Deploy Chunks

Build generates:
- `index.bundle` - Main bundle
- `settings.chunk.bundle` - Lazy-loaded chunk

Remote chunks are written to `build/output/<platform>/remotes` by default. Deploy chunks as first-party release artifacts. Prefer app-bundled assets; if hosted, publish them through CI to an app-owned HTTPS origin and keep the allowlist or signed manifest in sync with the app release.

## Complete Example

```tsx
// App.tsx
import React, { Suspense, useState } from 'react';
import { Button, View, ActivityIndicator } from 'react-native';

// Lazy load heavy feature
const HeavyFeature = React.lazy(() =>
  import(/* webpackChunkName: "heavy-feature" */ './HeavyFeature')
);

const App = () => {
  const [showFeature, setShowFeature] = useState(false);
  
  return (
    <View>
      <Button 
        title="Load Feature" 
        onPress={() => setShowFeature(true)} 
      />
      
      {showFeature && (
        <Suspense fallback={<ActivityIndicator />}>
          <HeavyFeature />
        </Suspense>
      )}
    </View>
  );
};
```

## Module Federation

Only use Module Federation when the app already has a micro-frontend architecture and the organizational boundary is worth the runtime trust boundary:

```tsx
// Host app loads remote module
const RemoteModule = React.lazy(() =>
  import('remote-app/Module')
);
```

Federation increases the trust boundary. Keep the same first-party origin, release-manifest, code-signing, and allowlist rules as above.

## Caching Strategy

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';

ScriptManager.shared.setStorage(AsyncStorage);
```

Set storage before adding resolvers so Re.Pack can cache resolved script locator data. Return `cache: false` for dev server chunks or any script that should bypass caching.

## When NOT to Use

| Scenario | Why Not |
|----------|---------|
| Using Hermes | mmap already efficient |
| Small app | Overhead not worth it |
| Simple navigation | Native navigation better |
| Quick iteration needed | Added complexity |

## Hermes Memory Mapping

Hermes reads bytecode lazily via mmap:
- Only loads executed code into memory
- No parse step needed
- Code splitting provides marginal benefit

## Verification

```tsx
// Check if chunk loaded correctly
ScriptManager.shared.on('loading', (script) => {
  console.log(`Loading: ${script.scriptId}`);
});

ScriptManager.shared.on('loaded', (script) => {
  console.log(`Loaded: ${script.scriptId}`);
});

ScriptManager.shared.on('error', (error) => {
  console.error('Script loading failed:', error);
});
```

## Common Pitfalls

- **Forgetting Suspense**: Lazy components need fallback
- **Wrong CDN path**: Chunks 404 in production
- **No caching**: Re-downloads on every load
- **Too many chunks**: Network overhead exceeds savings
- **Untrusted chunk source**: JS chunks from third-party or user-controlled origins are equivalent to remote code execution

## Related Skills

- [bundle-tree-shaking.md](./bundle-tree-shaking.md) - Tree-shaking caveats
- [bundle-analyze-js.md](./bundle-analyze-js.md) - Measure chunk sizes
- [native-measure-tti.md](./native-measure-tti.md) - Verify TTI impact

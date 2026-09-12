---
title: React Compiler
impact: HIGH
tags: memoization, react-compiler, memo, useMemo, useCallback
---

# Skill: React Compiler

Set up React Compiler to automatically memoize components and eliminate unnecessary re-renders.

## Quick Pattern

**Before (manual memoization):**

```jsx
const MemoizedButton = memo(({ onPress }) => <Pressable onPress={onPress} />);
const handler = useCallback(() => doSomething(), []);
```

**After (automatic with React Compiler):**

```jsx
// No memo/useCallback needed - compiler handles it
const Button = ({ onPress }) => <Pressable onPress={onPress} />;
const handler = () => doSomething();
```

## When to Use

- Want automatic performance optimization without manual `memo`/`useMemo`/`useCallback`
- Codebase follows Rules of React
- React Native 0.76+ or Expo SDK 52+
- Ready to remove boilerplate memoization code

## Prerequisites

- Babel-based build system
- Code follows [Rules of React](https://react.dev/reference/rules)
- Check current React Native, Expo, and React Compiler release notes before copying version-specific setup

## Step-by-Step Instructions

### Step 1: Check Compatibility

Before enabling the compiler, verify your project is compatible:

```bash
npx react-compiler-healthcheck@latest
```

This checks if your app follows the Rules of React and identifies potential issues.

### Step 2: Install React Compiler

#### Expo

Use Expo's SDK-specific path:

```bash
# SDK 54 and later: Babel is auto-configured
npx expo install babel-plugin-react-compiler@beta

# SDK 53: install runtime too
npx expo install babel-plugin-react-compiler@beta react-compiler-runtime@beta
```

Then enable the experiment in app config:

```json
{
  "expo": {
    "experiments": {
      "reactCompiler": true
    }
  }
}
```

#### React Native without Expo

```bash
npm install -D babel-plugin-react-compiler@latest
```

For React 17 or 18 targets, also install the compiler runtime:

```bash
npm install react-compiler-runtime@latest
```

Prefer the setup path documented for the app's exact Expo SDK, React Native, and React versions.

### Step 3: Configure Babel (React Native without Expo)

For non-Expo React Native projects, configure Babel manually and keep the compiler first in the plugin pipeline:

```javascript
// babel.config.js
const ReactCompilerConfig = {
  target: '19', // Use '18' for React Native < 0.78
};

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      ['babel-plugin-react-compiler', ReactCompilerConfig],
      // ... other plugins
    ],
  };
};
```

### Step 4: Set Up ESLint (Recommended)

Use the React Hooks/Compiler lint rules that match the app's React version. For Expo, SDK 55+ includes React Compiler lint rules through `eslint-config-expo`; SDK 54 and earlier need `eslint-plugin-react-compiler`. Fix rule violations before treating a component as compiler-optimized; skipped components are safe but do not get the intended memoization.

### Step 5: Verify Optimizations

Verify with `agent-device react-devtools` before/after render measurements. For release-build verification, connect [`@callstack/inspector`](https://github.com/callstackincubator/inspector#inspector) first so React DevTools can attach. Some visual DevTools versions show compiler memoization badges, but profiler evidence is the stable signal.

## Incremental Adoption

You can incrementally adopt React Compiler using two strategies:

### Strategy 1: Limit to Specific Directories

Configure the Babel plugin to only run on specific files, e.g. `src/path/to/dir` in the following examples:

**Expo** (create `babel.config.js` with `npx expo customize babel.config.js`):

```javascript
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          'react-compiler': {
            sources: (filename) => {
              return filename.includes('src/path/to/dir');
            },
          },
        },
      ],
    ],
  };
};
```

**React Native (without Expo)**:

```javascript
// babel.config.js
const ReactCompilerConfig = {
  target: '19',
  sources: (filename) => {
    return filename.includes('src/path/to/dir');
  },
};

module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [['babel-plugin-react-compiler', ReactCompilerConfig]],
  };
};
```

After changing Babel config, restart Metro with a cleared cache.

### Strategy 2: Opt Out Specific Components

Use the `"use no memo"` directive to skip optimization for specific components or files:

```jsx
function ProblematicComponent() {
  'use no memo';

  return <Text>Will not be optimized</Text>;
}
```

This is useful for temporarily opting out components that cause issues. Fix the underlying problem and remove the directive once resolved.

## Code Examples

### React Compiler Playground

Test transformations at [React Playground](https://playground.react.dev/).

### What Gets Optimized

```jsx
// Components - auto-memoized
const Button = ({ onPress, label }) => (
  <Pressable onPress={onPress}>
    <Text>{label}</Text>
  </Pressable>
);

// Callbacks - auto-cached (no useCallback needed)
const handlePress = () => {
  console.log('pressed');
};

// Expensive computations - auto-cached (no useMemo needed)
const filtered = items.filter((item) => item.active);
```

### What Breaks Compilation

```jsx
// BAD: Mutating props
const BadComponent = ({ items }) => {
  items.push('new item'); // Mutation!
  return <List data={items} />;
};

// BAD: Mutating during render
const BadMutation = () => {
  const [items, setItems] = useState([]);
  items.push('new'); // Mutation during render!
  return <List data={items} />;
};

// BAD: Non-idempotent render
let counter = 0;
const BadRender = () => {
  counter++; // Side effect during render!
  return <Text>{counter}</Text>;
};
```

## Should You Remove Manual Memoization?

Improvements are primarily automatic. You can remove instances of `useCallback`, `useMemo`, and `React.memo` in favor of automatic memoization once the compiler is working correctly in your project.

**Note**: Class components will not be optimized. Migrate to function components for full benefits.

Expo's implementation only runs on application code (not node_modules), and only when bundling for the client (disabled in server rendering).

## Expected Performance Improvements

Expect the largest wins in components that currently rely on manual memoization discipline or have cascading re-renders. Already well-memoized code may show little change; keep the compiler only when profiling or maintenance cost justifies it.

## Common Pitfalls

- **Not fixing ESLint errors first**: When ESLint reports an error, the compiler skips that component—this is safe but means you miss optimization
- **Expecting it to fix bad patterns**: Compiler optimizes good code, doesn't fix bad code
- **Forgetting shallow comparison**: Like `memo`, compiler uses shallow comparison for objects/arrays
- **Not running healthcheck**: Always run `npx react-compiler-healthcheck@latest` before enabling

## Related Skills

- [js-profile-react.md](./js-profile-react.md) - Verify optimization impact
- [js-atomic-state.md](./js-atomic-state.md) - Alternative for state-related re-renders

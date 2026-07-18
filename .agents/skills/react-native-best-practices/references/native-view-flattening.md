---
title: View Flattening
impact: MEDIUM
tags: views, flattening, collapsable, hierarchy
---

# Skill: View Flattening

Understand and debug React Native's view flattening optimization.

## Quick Pattern

**Problem (children get flattened unexpectedly):**

```jsx
<NativeTabBar>
  <Tab1 />  // May be flattened, breaking native component
  <Tab2 />
</NativeTabBar>
```

**Solution (prevent flattening):**

```jsx
<NativeTabBar>
  <Tab1 collapsable={false} />
  <Tab2 collapsable={false} />
</NativeTabBar>
```

## When to Use

- Native component receives unexpected number of children
- Layout debugging with native components
- Building native components that accept children
- Understanding React Native rendering

> **Note**: This skill involves visual view hierarchy tools (Xcode Debug View Hierarchy, Android Layout Inspector). Use `agent-device` for screen evidence; install it through the environment's approved/trusted path or ask the user if verification needs it and it is missing. Native hierarchy inspection may still require Xcode, Android Studio, or human review. Record native child counts and component names in text when asking an agent to reason about them.

## What is View Flattening?

React Native's renderer automatically removes "layout-only" views that:
- Only affect layout (no visual rendering)
- Don't need to exist in native view hierarchy

**Benefits**: Reduced memory, faster rendering, shallower view tree.

## The Problem with Native Components

```tsx
// You expect 3 children
<MyNativeComponent>
  <Child1 />
  <Child2 />
  <Child3 />
</MyNativeComponent>
```

If a child wrapper is flattened, native code may receive a different child count or shape than the JS tree suggests.

## Preventing Flattening with `collapsable`

```tsx
<MyNativeComponent>
  <Child1 collapsable={false} />
  <Child2 collapsable={false} />
  <Child3 collapsable={false} />
</MyNativeComponent>
```

The direct views marked `collapsable={false}` are preserved as native children.

## Debugging View Hierarchy

![View Hierarchy Flattening](images/view-hierarchy-flattening.png)

Use native debugging tools to see the actual view hierarchy:

### Xcode (iOS)

1. Run app via Xcode
2. Click **"Debug View Hierarchy"** in debug toolbar (shown in image)
3. Inspect 3D view of native hierarchy

Component class names vary by architecture and React Native version; verify the actual native hierarchy in the tool.

### Android Studio

1. Run app via Android Studio
2. **View → Tool Windows → Layout Inspector**
3. Select running process

Component class names vary by architecture and React Native version; verify the actual native hierarchy in the tool.

## Code Examples

### When Flattening Breaks Your Component

```tsx
// Your native component expects exactly 2 tabs
const NativeTabBar = requireNativeComponent('RCTTabBar');

// BAD: TabContent might get flattened
const MyTabs = () => (
  <NativeTabBar>
    <TabContent title="Home">
      <View><Text>Home content</Text></View>
    </TabContent>
    <TabContent title="Profile">
      <View><Text>Profile content</Text></View>
    </TabContent>
  </NativeTabBar>
);

// GOOD: Prevent flattening
const MyTabs = () => (
  <NativeTabBar>
    <TabContent title="Home" collapsable={false}>
      <View><Text>Home content</Text></View>
    </TabContent>
    <TabContent title="Profile" collapsable={false}>
      <View><Text>Profile content</Text></View>
    </TabContent>
  </NativeTabBar>
);
```

### Wrapper Component with collapsable

```tsx
// Wrapper that prevents flattening
const NativeChildWrapper = ({ children, ...props }) => (
  <View collapsable={false} {...props}>
    {children}
  </View>
);

// Usage
<NativeComponent>
  <NativeChildWrapper>
    <ComplexChild />
  </NativeChildWrapper>
</NativeComponent>
```

## When Views Get Flattened

React Native can flatten layout-only wrappers that do not need their own native view for drawing, events, accessibility, measurement, or native-component child semantics. The exact rules vary across renderer versions.

## Forcing a View to Stay

Use `collapsable={false}` as the stable fix. Style or handler changes can be useful as debugging probes, but do not keep them as the production solution:

```tsx
// Diagnostic probes only
<View style={{ backgroundColor: 'transparent' }} />
<View style={{ borderWidth: 0.01 }} />
<View style={{ opacity: 0.99 }} />
<View onLayout={() => {}} />
```

Remove these probes after confirming flattening is the issue.

## Debugging Checklist

1. **Check native child count**: Log received children in native code
2. **Use Layout Inspector**: Visual hierarchy debugging
3. **Add collapsable={false}**: Test if flattening is the issue
4. **Check wrapper components**: Intermediate views may be flattened

## Common Pitfalls

- **Assuming JS children = native children**: Flattening changes this
- **Not documenting native component requirements**: If your native component expects specific child count, document it
- **Over-using collapsable={false}**: Only use when necessary (loses optimization benefits)

## Related Skills

- [native-platform-setup.md](./native-platform-setup.md) - IDE setup for debugging
- [native-profiling.md](./native-profiling.md) - Performance impact analysis

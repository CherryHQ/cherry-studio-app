# How We Built the v0 iOS App

> **Source**: [Vercel Blog - How We Built the v0 iOS App](https://vercel.com/blog/how-we-built-the-v0-ios-app)

## Overview

Vercel recently released v0 for iOS, their first native mobile application. Rather than pursuing cross-platform compromise, the team experimented extensively with different technical approaches before settling on React Native with Expo.

## Tech Stack Decision

The team evaluated multiple frameworks before choosing React Native with Expo. Their goal was creating an app that deserved recognition as a world-class iOS experience—one worthy of an Apple Design Award. They drew inspiration from native iOS applications like Apple Notes and iMessage, ensuring v0 would compete for Home Screen placement among the finest apps.

## Chat Experience Architecture

### Composable Design Pattern

The chat implementation uses a provider-based architecture with multiple context layers:

```
ChatProvider wraps:
- ComposerHeightProvider
- MessageListProvider
- NewMessageAnimationProvider
- KeyboardStateProvider
```

The core MessagesList component implements features as composable plugins, each with its own hook (useKeyboardAwareMessageList, useScrollMessageListFromComposerSizeUpdates, useUpdateLastMessageIndex).

### Animation Strategy

**First Message Flow**: When users send initial messages, the system:

1. Sets a Reanimated shared value to trigger animations
2. Fades and slides user messages smoothly upward
3. After user message animation completes, fades in assistant responses

The team used Reanimated shared values to update animation state without triggering re-renders, keeping animations performant.

### The "Blank Size" Solution

A critical challenge emerged: how to make new messages appear at the top of the chat rather than the bottom? The solution involved "blank size"—the dynamic distance between the last message and the chat container's end.

Rather than using Views with specific heights or padding (which caused jitters), they leveraged ScrollView's native `contentInset` property, which directly maps to UIKit's UIScrollView. This approach paired with `scrollToEnd({ offset })` eliminated animation artifacts.

The blank size calculation accounts for:

- Assistant message height
- Preceding user message height
- Chat container dimensions
- Keyboard state (open/closed)

## Keyboard Management

Handling the iOS keyboard proved exceptionally challenging, requiring constant adjustments as Apple released new iOS versions. The team credits Kiryl Ziusko (react-native-keyboard-controller maintainer) for rapid updates during beta testing cycles.

The custom `useKeyboardAwareMessageList` hook (approximately 1,000 lines) handles complex scenarios:

- Shrinking blank size when keyboards open
- Shifting content intelligently based on scroll position
- Supporting interactive keyboard dismissal
- Deduplicating redundant iOS keyboard events
- Managing edge cases across iOS beta releases

## Text Input Enhancement

React Native's default TextInput felt inconsistent with native iOS apps. The team patched the native `RCTUITextView` component to:

- Disable scroll indicators
- Remove bounce effects
- Enable interactive keyboard dismissal
- Add pan gesture support to focus the input

While maintaining patches across React Native updates isn't ideal, it was pragmatically necessary for achieving the desired feel.

## Floating Composer

The composer floats above scrollable content using:

1. `position: absolute; bottom: 0`
2. `KeyboardStickyView` wrapper with keyboard-aware offsets
3. Synchronous height measurement stored in shared values
4. Addition of composer height to ScrollView's `contentInset.bottom`

When the text input grows (multiline), `useScrollWhenComposerSizeUpdates` automatically scrolls to end if the user is already scrolled to the bottom, simulating a non-absolute-positioned input.

## Streaming Content Animation

As AI responses stream in, content fades in with staggered animations. The implementation uses:

- `FadeInStaggeredIfStreaming` component wrapping rendered elements
- `useIsAnimatedInPool` custom state manager limiting concurrent animations
- Staggered delays of 32ms between elements
- Batch animation scheduling (2 items at a time, adjusting based on queue size)
- `TextFadeInStaggeredIfStreaming` for word-level fading with a limit of 4 concurrent words

Animation state gets removed after completion, replacing animated wrappers with direct children. The system tracks which content users have already seen animating, preventing re-animation when switching chats.

## Code Sharing Between Platforms

Rather than attempting full UI parity, the team:

- Shared types and helper functions
- Migrated business logic to the server
- Built a hand-rolled backend with Zod-enforced type safety
- Generated OpenAPI specs from route definitions
- Used Hey API to generate TypeScript helpers for mobile consumption

This approach led to developing the v0 Platform API, now available to all customers.

## Native UI Components

Instead of JavaScript component libraries, the team used native equivalents:

- **Menus**: Zeego (wrapping react-native-ios-context-menu) renders native UIMenu with automatic Liquid Glass support in Xcode 16
- **Alerts**: Applied upstream React Native patches fixing off-screen rendering
- **Bottom Sheets**: Used native modal with `presentationStyle="formSheet"`, patching React Native for smooth dragging and Yoga synchronization issues

## Styling

The app uses react-native-unistyles for styling and theming, offering comprehensive theme support without re-rendering components or accessing React Context.

## Key Learnings

The team encountered numerous platform-specific challenges requiring native code patches, many eventually upstreamed to React Native core. Despite the complexity, they're satisfied with their framework choice and customer reception has been positive.

The developers are now exploring open-sourcing their approaches for the React Native community, particularly around building AI chat experiences on mobile platforms.

import { randomUUID as mockRandomUUID } from 'node:crypto';

global.__DEV__ = true;

// Some tests replace react-native wholesale. Keep Expo's lazy fetch setup from
// falling through to the then-missing TurboModuleRegistry during teardown.
const expoModules = (
  globalThis as typeof globalThis & {
    expo?: { modules?: Record<string, unknown> };
  }
).expo?.modules;
if (expoModules) {
  expoModules.ExpoModulesCoreJSLogger = { addListener: jest.fn() };
}

// expo-crypto's jest-expo auto-mock is an empty stub (randomUUID() returns
// undefined), so anything depending on a real id breaks under test.
jest.mock('expo-crypto', () => ({ randomUUID: mockRandomUUID }));

// expo-glass-effect probes UIKit availability at import time and
// src/frontend/utils/constants.ts calls it at module scope, so give Jest a static
// "no glass" stub.
jest.mock('expo-glass-effect', () => ({
  isGlassEffectAPIAvailable: () => false,
  isLiquidGlassAvailable: () => false,
}));

// expo-screen-corner-radius resolves its native module at import time, so any
// suite reaching BottomSheet throws without this. `null` is the library's own
// "display radius unknown" answer, which every caller already handles.
jest.mock('expo-screen-corner-radius', () => ({ getCornerRadiusSync: () => null }));

// The library resolves its native module at import time. Its own jest entry is
// the sanctioned stand-in and keeps the hooks/event emitters callable, which the
// chat list needs the moment it imports KeyboardEvents.
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);

// Both of its components are Fabric views, so rendering one or calling any ref
// method throws under Jest — and the composer's field is one of them. The
// shipped entry renders a real `TextInput` and turns every imperative method
// into a spy, which is what lets mention insertion be asserted at all.
jest.mock('react-native-enriched-markdown', () => require('react-native-enriched-markdown/jest'));

// Minimal Skia surface for components that render under test (AnimatedText):
// declarative elements become inert nodes and matchFont hands back fixed
// glyph geometry. The official mock lacks matchFont, so we roll our own.
jest.mock('@shopify/react-native-skia', () => {
  const react = require('react');
  const inert =
    (name: string) =>
    ({ children, ...props }: { children?: unknown }) =>
      react.createElement(name, props, children);

  return {
    Canvas: inert('SkiaCanvas'),
    Circle: inert('SkiaCircle'),
    Group: inert('SkiaGroup'),
    Line: inert('SkiaLine'),
    Text: inert('SkiaText'),
    BlurMask: inert('SkiaBlurMask'),
    Rect: inert('SkiaRect'),
    RoundedRect: inert('SkiaRoundedRect'),
    Shader: inert('SkiaShader'),
    ImageShader: inert('SkiaImageShader'),
    Path: inert('SkiaPath'),
    Mask: inert('SkiaMask'),
    vec: (x: number, y: number) => ({ x, y }),
    matchFont: () => ({
      getGlyphIDs: (text: string) => Array.from(text).map((_, index) => index),
      getGlyphWidths: (ids: number[]) => ids.map(() => 8),
      getMetrics: () => ({ ascent: -11, descent: 3 }),
    }),
    // The image-generation loader compiles SkSL at module scope, so
    // RuntimeEffect.Make must return a truthy stub under test.
    Skia: {
      Color: (color: number | string) => color,
      RuntimeEffect: {
        Make: () => ({}),
      },
    },
  };
});

// react-native-mmkv is a Nitro HybridObject with no JS fallback and (as of
// 4.3.2) no official jest mock entry. The cacheService singleton constructs an
// MMKV instance at module scope, so any import chain reaching it needs this
// Map-backed stand-in. CacheService unit tests bypass it by injecting
// InMemoryKVStorage directly.
jest.mock('react-native-mmkv', () => {
  const createMMKV = () => {
    const store = new Map<string, string>();
    return {
      set: (key: string, value: string) => {
        store.set(key, value);
      },
      getString: (key: string) => store.get(key),
      contains: (key: string) => store.has(key),
      remove: (key: string) => store.delete(key),
      getAllKeys: () => [...store.keys()],
      clearAll: () => {
        store.clear();
      },
    };
  };

  return { createMMKV };
});

// react-native-nitro-theme-transition is another Nitro HybridObject. The library
// already degrades to "just run the callback" when the native side is missing, so
// this is not about avoiding a crash — it is about not dragging
// react-native-nitro-modules into every suite whose import chain reaches
// useSettingPreferences. Running the callback inline keeps the theme swap
// synchronous, which is what the real thing does under the snapshot.
jest.mock('react-native-nitro-theme-transition', () => ({
  withThemeTransition: (applyTheme: () => void) => applyTheme(),
}));

// gesture-handler 真模块在 jest 下要求 Reanimated.default.createAnimatedComponent，
// 而 jest 环境的 reanimated 没有这个 API。GestureDetector 透传 children，
// Gesture.* 返回任意链式调用都指向自身的构建器。
jest.mock('react-native-gesture-handler', () => {
  const react = require('react');
  const { Pressable, View } = require('react-native');
  const createChainableGesture = (): unknown => {
    const gesture: object = new Proxy(
      {},
      {
        get:
          () =>
          (..._args: unknown[]) =>
            gesture,
      },
    );
    return gesture;
  };

  return {
    Gesture: new Proxy({}, { get: () => () => createChainableGesture() }),
    GestureDetector: ({ children }: { children?: unknown }) => children,
    GestureHandlerRootView: ({ children, ...props }: { children?: unknown }) =>
      react.createElement(View, props, children),
    Pressable,
  };
});

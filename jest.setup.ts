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
// src/config/constants.ts calls it at module scope, so give Jest a static
// "no glass" stub.
jest.mock('expo-glass-effect', () => ({
  isGlassEffectAPIAvailable: () => false,
  isLiquidGlassAvailable: () => false,
}));

// expo-screen-corner-radius resolves its native module at import time, so any
// suite reaching BottomSheet throws without this. `null` is the library's own
// "display radius unknown" answer, which every caller already handles.
jest.mock('expo-screen-corner-radius', () => ({ getCornerRadiusSync: () => null }));

// Callstack bottom tabs is a Fabric native view and is unavailable in Jest.
// Keep its layout context present so tab-owned screens can render normally.
jest.mock('react-native-bottom-tabs', () => {
  const react = require('react');
  const { View } = require('react-native');
  const BottomTabBarHeightContext = react.createContext(0);
  const TabView = ({
    navigationState,
    renderScene,
  }: {
    navigationState?: { index: number; routes: unknown[] };
    renderScene?: (props: { route: unknown }) => unknown;
  }) => {
    const route = navigationState?.routes[navigationState.index];
    const scene = route && renderScene ? renderScene({ route }) : null;

    return react.createElement(
      BottomTabBarHeightContext.Provider,
      { value: 0 },
      react.createElement(View, null, scene),
    );
  };

  return {
    __esModule: true,
    BottomTabBarHeightContext,
    default: TabView,
    SceneMap: (scenes: Record<string, unknown>) => scenes,
    useBottomTabBarHeight: () => react.use(BottomTabBarHeightContext),
  };
});

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
    Group: inert('SkiaGroup'),
    Text: inert('SkiaText'),
    BlurMask: inert('SkiaBlurMask'),
    Rect: inert('SkiaRect'),
    RoundedRect: inert('SkiaRoundedRect'),
    Shader: inert('SkiaShader'),
    ImageShader: inert('SkiaImageShader'),
    Path: inert('SkiaPath'),
    Mask: inert('SkiaMask'),
    matchFont: () => ({
      getGlyphIDs: (text: string) => Array.from(text).map((_, index) => index),
      getGlyphWidths: (ids: number[]) => ids.map(() => 8),
      getMetrics: () => ({ ascent: -11, descent: 3 }),
    }),
    // thinkingPixelField.ts compiles its SkSL at module scope, so RuntimeEffect.Make
    // must return a truthy stub or the ChatInputSurface import chain throws under test.
    Skia: {
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

// gesture-handler 真模块在 jest 下要求 Reanimated.default.createAnimatedComponent，
// 而 jest 环境的 reanimated 没有这个 API。GestureDetector 透传 children，
// Gesture.* 返回任意链式调用都指向自身的构建器。
jest.mock('react-native-gesture-handler', () => {
  const react = require('react');
  const { View } = require('react-native');
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
  };
});

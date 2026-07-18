import { randomUUID as mockRandomUUID } from 'node:crypto';

global.__DEV__ = true;

// expo-crypto's jest-expo auto-mock is an empty stub (randomUUID() returns
// undefined), so anything depending on a real id breaks under test.
jest.mock('expo-crypto', () => ({ randomUUID: mockRandomUUID }));

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
    RoundedRect: inert('SkiaRoundedRect'),
    Shader: inert('SkiaShader'),
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

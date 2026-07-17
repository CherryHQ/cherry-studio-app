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
    matchFont: () => ({
      getGlyphIDs: (text: string) => Array.from(text).map((_, index) => index),
      getGlyphWidths: (ids: number[]) => ids.map(() => 8),
      getMetrics: () => ({ ascent: -11, descent: 3 }),
    }),
  };
});

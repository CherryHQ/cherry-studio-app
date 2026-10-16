import type { DataSourceParam } from '@shopify/react-native-skia';

/** What the character reports; callers map their own execution states onto these. */
export type CharacterStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'failed';
export type CharacterExpression = 'idle' | 'blink' | 'thinking' | 'waiting' | 'done' | 'error';

export type Point = { x: number; y: number };

/** Anchors in canvas pixels; only `frame` and `neck` are required. */
export type CharacterRig = {
  /** Square canvas size shared by every layer. */
  size: number;
  /** Region that fills the avatar circle. */
  frame: { center: Point; side: number };
  /** Squash, stretch and tilt pivot; everything above it trails the motion. */
  neck: Point;
  /** A separate hair-tuft layer springs around this point. */
  tuft?: { pivot: Point };
  /** Hair masses that swing on their own. */
  sways: Point[];
};

/** Images for one character. Any Skia data source: bundled module or file URI. */
export type CharacterLayers = {
  expressions: Record<CharacterExpression, DataSourceParam>;
  tuft?: DataSourceParam;
};

export type CharacterSprite = { rig: CharacterRig; layers: CharacterLayers };

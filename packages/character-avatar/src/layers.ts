import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';

import {
  type CharacterManifest,
  CharacterManifestSchema,
  CharacterPackManifestSchema,
  characterLayers,
} from './manifest';

export class CharacterPackError extends Error {
  constructor(
    readonly code: 'pack-invalid' | 'layer-missing' | 'layer-invalid' | 'not-transparent',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CharacterPackError';
  }
}

type Bounds = { left: number; top: number; right: number; bottom: number };

/** Decodes one layer, checks its canvas, and returns the bounds of its opaque pixels. */
function inspectLayer(name: string, bytes: Uint8Array, size: number): Bounds | null {
  const data = Skia.Data.fromBytes(bytes);
  const image = Skia.Image.MakeImageFromEncoded(data);
  try {
    if (!image || image.width() !== size || image.height() !== size) {
      throw new CharacterPackError('layer-invalid', `Layer "${name}" must be a ${size}px square.`);
    }
    const pixels = image.readPixels(0, 0, {
      width: size,
      height: size,
      colorType: ColorType.RGBA_8888,
      alphaType: AlphaType.Unpremul,
    });
    if (!pixels) throw new CharacterPackError('layer-invalid', `Layer "${name}" is unreadable.`);
    let left = size;
    let top = size;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (pixels[(y * size + x) * 4 + 3]! < 24) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return right < 0 ? null : { left, top, right, bottom };
  } finally {
    image?.dispose();
    data.dispose();
  }
}

/** Frame and neck from the idle silhouette: a centred square with a small margin. */
function deriveRig(bounds: Bounds) {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  return {
    frame: { center, side: Math.max(width, height) * 1.06 },
    neck: { x: center.x, y: bounds.bottom - height * 0.07 },
  };
}

/**
 * Checks a pack's layers (encoded PNG or WebP bytes by layer name) against its manifest: every
 * required layer present, one square canvas, a transparent background. Returns the complete
 * manifest, deriving `frame` and `neck` from the idle silhouette when the pack omits them.
 */
export function validateCharacterLayers(
  manifest: unknown,
  layers: Readonly<Record<string, Uint8Array>>,
): CharacterManifest {
  const parsed = CharacterPackManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new CharacterPackError('pack-invalid', 'character.json is invalid.', {
      cause: parsed.error,
    });
  }
  const pack = parsed.data;
  let idle: Bounds | null = null;
  for (const name of characterLayers(pack)) {
    const bytes = layers[name];
    if (!bytes) throw new CharacterPackError('layer-missing', `Missing layer "${name}".`);
    const bounds = inspectLayer(name, bytes, pack.size);
    if (name === 'idle') idle = bounds;
  }
  if (!idle) throw new CharacterPackError('layer-invalid', 'The idle layer is empty.');
  const margin = Math.round(pack.size * 0.01);
  if (
    idle.left <= margin &&
    idle.top <= margin &&
    idle.right >= pack.size - 1 - margin &&
    idle.bottom >= pack.size - 1 - margin
  ) {
    throw new CharacterPackError('not-transparent', 'Layers need a transparent background.');
  }
  const derived = deriveRig(idle);
  return CharacterManifestSchema.parse({
    ...pack,
    rig: {
      ...pack.rig,
      frame: pack.rig.frame ?? derived.frame,
      neck: pack.rig.neck ?? derived.neck,
    },
  });
}

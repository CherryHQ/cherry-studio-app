import {
  ClipOp,
  FilterMode,
  ImageFormat,
  MipmapMode,
  type SkImage,
  Skia,
} from '@shopify/react-native-skia';

import type { CharacterRig } from './engine/types';

/**
 * The idle character on a round `background` swatch: what lists, covers and system surfaces show
 * when nothing animates, as PNG bytes. Imperative Skia so it runs outside React (backend tools).
 */
export function drawCharacterCover(input: {
  rig: CharacterRig;
  idle: SkImage;
  tuft?: SkImage | null;
  background: string;
  size: number;
}): Uint8Array {
  const { rig, idle, tuft, background, size } = input;
  const surface = Skia.Surface.Make(size, size);
  if (!surface) throw new Error('Cannot allocate a cover surface.');
  try {
    const canvas = surface.getCanvas();
    const circle = Skia.RRectXY(Skia.XYWHRect(0, 0, size, size), size / 2, size / 2);
    canvas.clipRRect(circle, ClipOp.Intersect, true);
    const paint = Skia.Paint();
    paint.setColor(Skia.Color(background));
    canvas.drawRRect(circle, paint);
    canvas.translate(size / 2, size / 2);
    canvas.scale(size / rig.frame.side, size / rig.frame.side);
    canvas.translate(-rig.frame.center.x, -rig.frame.center.y);
    const whole = Skia.XYWHRect(0, 0, rig.size, rig.size);
    for (const layer of tuft ? [idle, tuft] : [idle]) {
      canvas.drawImageRectOptions(
        layer,
        Skia.XYWHRect(0, 0, layer.width(), layer.height()),
        whole,
        FilterMode.Linear,
        MipmapMode.Linear,
      );
    }
    surface.flush();
    const snapshot = surface.makeImageSnapshot();
    try {
      return snapshot.encodeToBytes(ImageFormat.PNG, 100);
    } finally {
      snapshot.dispose();
    }
  } finally {
    surface.dispose();
  }
}

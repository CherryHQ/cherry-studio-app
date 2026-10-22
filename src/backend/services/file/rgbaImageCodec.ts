import {
  AlphaType,
  ColorType,
  FilterMode,
  ImageFormat,
  MipmapMode,
  type SkImage,
  Skia,
} from '@shopify/react-native-skia';

import type { RgbaImage } from '@/backend/utils/rgbaImage';

/** Read lazily: module load must not touch native enums (tests mock Skia without them). */
const rgba = () => ({ colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });

function readRgba(image: SkImage): RgbaImage {
  const width = image.width();
  const height = image.height();
  const pixels = image.readPixels(0, 0, { width, height, ...rgba() });
  if (!pixels) throw new Error('Cannot read image pixels.');
  return {
    width,
    height,
    data: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
  };
}

/** Decodes PNG/JPEG/WebP bytes; with `square`, fits the image centred on a transparent square. */
export function decodeRgba(bytes: Uint8Array, square?: number): RgbaImage {
  const data = Skia.Data.fromBytes(bytes);
  const image = Skia.Image.MakeImageFromEncoded(data);
  try {
    if (!image) throw new Error('Cannot decode image.');
    if (!square) return readRgba(image);
    const surface = Skia.Surface.Make(square, square);
    if (!surface) throw new Error('Cannot allocate an image surface.');
    try {
      const scale = Math.min(square / image.width(), square / image.height());
      const width = image.width() * scale;
      const height = image.height() * scale;
      surface
        .getCanvas()
        .drawImageRectOptions(
          image,
          Skia.XYWHRect(0, 0, image.width(), image.height()),
          Skia.XYWHRect((square - width) / 2, (square - height) / 2, width, height),
          FilterMode.Linear,
          MipmapMode.Linear,
        );
      surface.flush();
      const snapshot = surface.makeImageSnapshot();
      try {
        return readRgba(snapshot);
      } finally {
        snapshot.dispose();
      }
    } finally {
      surface.dispose();
    }
  } finally {
    image?.dispose();
    data.dispose();
  }
}

export function encodePng(image: RgbaImage): Uint8Array {
  const data = Skia.Data.fromBytes(image.data);
  const encoded = Skia.Image.MakeImage(
    { width: image.width, height: image.height, ...rgba() },
    data,
    image.width * 4,
  );
  try {
    if (!encoded) throw new Error('Cannot create image from pixels.');
    return encoded.encodeToBytes(ImageFormat.PNG, 100);
  } finally {
    encoded?.dispose();
    data.dispose();
  }
}

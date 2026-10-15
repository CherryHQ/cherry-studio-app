import { FilterMode, ImageFormat, MipmapMode, Skia } from '@shopify/react-native-skia';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import type { ImageEditInput } from '@/shared/contracts/fileImageEdit';
import { imageEditGeometry } from '@/shared/utils/imageEditGeometry';
import { generatedImageExtension } from '@/shared/utils/imageFileTypes';

/** CPU rendering keeps source resolution and shares the exact preview transform. */
export async function renderEditedImage(
  uri: string,
  mediaType: string,
  edit: ImageEditInput,
  signal?: AbortSignal,
): Promise<{ uri: string; release(): void }> {
  const resources: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(resource: T): T => {
    resources.push(resource);
    return resource;
  };
  let output: File | undefined;
  try {
    const data = keep(await Skia.Data.fromURI(uri));
    signal?.throwIfAborted();
    const decoded = Skia.Image.MakeImageFromEncoded(data);
    if (!decoded) throw new Error('Cannot decode image for editing.');
    const image = keep(decoded);
    const geometry = imageEditGeometry(edit, { width: image.width(), height: image.height() });
    const crop = edit.crop;
    const bounds = geometry.bounds;
    // Do not persist blank wedges if a stale or external caller supplies an unsafe selection.
    if (
      crop.x < bounds.x - 1e-7 ||
      crop.y < bounds.y - 1e-7 ||
      crop.x + crop.width > bounds.x + bounds.width + 1e-7 ||
      crop.y + crop.height > bounds.y + bounds.height + 1e-7
    ) {
      throw new Error('Crop is outside the transformed image.');
    }
    const originX = Math.min(geometry.width - 1, Math.round(crop.x * geometry.width));
    const originY = Math.min(geometry.height - 1, Math.round(crop.y * geometry.height));
    const right = Math.min(
      geometry.width,
      Math.max(originX + 1, Math.round((crop.x + crop.width) * geometry.width)),
    );
    const bottom = Math.min(
      geometry.height,
      Math.max(originY + 1, Math.round((crop.y + crop.height) * geometry.height)),
    );
    const surface = Skia.Surface.Make(right - originX, bottom - originY);
    if (!surface) throw new Error('Cannot allocate edited image surface.');
    keep(surface);
    const canvas = surface.getCanvas();
    canvas.translate(-originX, -originY);
    canvas.concat(geometry.matrix);
    canvas.drawImageRectOptions(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      FilterMode.Linear,
      MipmapMode.None,
    );
    surface.flush();
    const snapshot = keep(surface.makeImageSnapshot());
    const format =
      mediaType === 'image/jpeg'
        ? ImageFormat.JPEG
        : mediaType === 'image/webp'
          ? ImageFormat.WEBP
          : ImageFormat.PNG;
    const bytes = snapshot.encodeToBytes(format, 100);
    signal?.throwIfAborted();
    const directory = new Directory(Paths.cache, 'ImageEdits');
    directory.create({ idempotent: true, intermediates: true });
    output = new File(directory, `${randomUUID()}.${generatedImageExtension(mediaType)}`);
    output.write(bytes);
    const completed = output;
    return {
      uri: completed.uri,
      release() {
        if (completed.exists) completed.delete();
      },
    };
  } catch (error) {
    if (output?.exists) output.delete();
    throw error;
  } finally {
    for (const resource of resources.toReversed()) resource.dispose();
  }
}

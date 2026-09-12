import ExpoQuickLook from '@magrinj/expo-quick-look';
import { Directory, File, Paths } from 'expo-file-system';

const cacheVersion = 1;
const thumbnailDirectory = new Directory(Paths.cache, 'FilePreview');
const pendingThumbnails = new Map<string, Promise<string>>();

export type QuickLookThumbnailInput = {
  height: number;
  id: string;
  revision: number | string;
  scale: number;
  uri: string;
  width: number;
};

export function quickLookThumbnailCacheKey(input: QuickLookThumbnailInput): string {
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  const scale = Math.max(1, Math.round(input.scale * 100) / 100);
  const id = encodeURIComponent(input.id);
  const revision = encodeURIComponent(String(input.revision));
  return `v${cacheVersion}_${id}_${revision}_${width}x${height}@${scale}.png`;
}

export async function getQuickLookThumbnail(input: QuickLookThumbnailInput): Promise<string> {
  const destination = new File(thumbnailDirectory, quickLookThumbnailCacheKey(input));
  if (destination.exists) {
    return destination.uri;
  }

  const pending = pendingThumbnails.get(destination.uri);
  if (pending) {
    return pending;
  }

  const generation = generateThumbnail(input, destination).finally(() => {
    pendingThumbnails.delete(destination.uri);
  });
  pendingThumbnails.set(destination.uri, generation);
  return generation;
}

async function generateThumbnail(
  input: QuickLookThumbnailInput,
  destination: File,
): Promise<string> {
  if (!thumbnailDirectory.exists) {
    thumbnailDirectory.create({ intermediates: true });
  }
  const result = await ExpoQuickLook.generateThumbnail({
    scale: input.scale,
    size: { height: input.height, width: input.width },
    uri: input.uri,
  });
  const temporaryFile = new File(result.uri);

  if (destination.exists) {
    if (temporaryFile.exists) {
      temporaryFile.delete();
    }
    return destination.uri;
  }

  await temporaryFile.move(destination);
  return destination.uri;
}

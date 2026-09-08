import ExpoQuickLook from '@magrinj/expo-quick-look';

import type { OpenFilePreviewInput } from './open-file.types';

/** iOS presents Quick Look itself, using the managed file's display name as its title. */
export async function openFilePreview({ file }: OpenFilePreviewInput): Promise<void> {
  await ExpoQuickLook.previewFile({
    editingMode: 'disabled',
    title: file.displayName,
    uri: file.uri,
  });
}

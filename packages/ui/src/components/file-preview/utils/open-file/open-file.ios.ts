import ExpoQuickLook from '@magrinj/expo-quick-look';

import type { OpenFilePreviewInput } from './open-file.types';

/** iOS presents Quick Look itself, so the chooser label has no counterpart. */
export async function openFilePreview({ file }: OpenFilePreviewInput): Promise<void> {
  await ExpoQuickLook.previewFile({ editingMode: 'disabled', uri: file.uri });
}

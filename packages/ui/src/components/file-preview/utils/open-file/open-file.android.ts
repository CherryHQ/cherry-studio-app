import ExpoQuickLook from '@magrinj/expo-quick-look';

import type { OpenFilePreviewInput } from './open-file.types';

/** Android routes to an app chooser, which needs the localized title. */
export async function openFilePreview({ file, labels }: OpenFilePreviewInput): Promise<void> {
  await ExpoQuickLook.previewFile({ chooserTitle: labels.openWith, uri: file.uri });
}

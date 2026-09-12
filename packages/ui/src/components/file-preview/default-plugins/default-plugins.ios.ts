import { ImagePreview } from '../components/image-preview';
import { QuickLookPreview } from '../components/quick-look-preview.ios';
import type { FilePreviewComponent, FilePreviewPlugin } from '../file-preview.types';

/**
 * Quick Look produces a system thumbnail for anything iOS can open, so it is a
 * better default than a generic extension card for every unregistered kind.
 */
export const defaultFilePreviewFallback: FilePreviewComponent = QuickLookPreview;

export const defaultFilePreviewPlugins: readonly FilePreviewPlugin[] = [
  { component: ImagePreview, kind: 'image' },
];

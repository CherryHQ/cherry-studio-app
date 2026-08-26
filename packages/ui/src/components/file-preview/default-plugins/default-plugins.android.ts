import { FallbackPreview } from '../components/fallback-preview';
import { ImagePreview } from '../components/image-preview';
import type { FilePreviewComponent, FilePreviewPlugin } from '../file-preview.types';

/**
 * Android has no system thumbnail service to call, so the extension card is the
 * default for every unregistered kind.
 */
export const defaultFilePreviewFallback: FilePreviewComponent = FallbackPreview;

export const defaultFilePreviewPlugins: readonly FilePreviewPlugin[] = [
  { component: ImagePreview, kind: 'image' },
];

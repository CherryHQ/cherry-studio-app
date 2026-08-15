import type { PaintingViewerImageProps } from './PaintingViewerImage.types';
import { ViewerImage } from './ViewerImage';

export function PaintingViewerImage({ uri }: PaintingViewerImageProps) {
  return <ViewerImage uri={uri} />;
}

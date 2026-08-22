import { RouteHeaderProvider } from '@/frontend/components/headers';
import { PaintingViewerScreen } from '@/frontend/features/paintings/PaintingViewerScreen';

export default function PaintingViewerRoute() {
  return (
    <RouteHeaderProvider rootAction="close">
      <PaintingViewerScreen />
    </RouteHeaderProvider>
  );
}

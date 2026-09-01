/* oxlint-disable react/style-prop-object -- Expo StatusBar style is a string union. */
import { useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { paintingViewer } from '@/frontend/utils/constants';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { Painting } from '@/shared/data/types/painting';

import {
  type ResolvedPaintingAttachment,
  usePainting,
  useResolvedPaintingFiles,
} from '../hooks/usePaintings';
import { PaintingViewerChrome } from './components/PaintingViewerChrome';
import { PaintingViewerImage } from './components/PaintingViewerImage';
import { usePaintingViewerActions } from './hooks/usePaintingViewerActions';

export function PaintingViewerScreen() {
  const params = useLocalSearchParams<{
    fileEntryId?: string | string[];
    paintingId?: string | string[];
  }>();
  const paintingId = getSingleRouteParam(params.paintingId);
  const fileEntryId = getSingleRouteParam(params.fileEntryId);
  const painting = usePainting(paintingId);
  const files = useResolvedPaintingFiles(painting.data);
  const current = files.data?.outputs.find((output) => output.fileEntryId === fileEntryId);
  const constantWhite = useThemeColor('constant-white');

  if (!painting.data || !current) {
    return (
      <View className="flex-1 bg-constant-black">
        <StatusBar style="light" />
        <View className="flex-1 items-center justify-center">
          {painting.isLoading || files.isLoading ? (
            <ActivityIndicator color={constantWhite} />
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-constant-black">
      <StatusBar style="light" />
      <PaintingViewerContent current={current} painting={painting.data} />
    </View>
  );
}

function PaintingViewerContent({
  current,
  painting,
}: {
  current: ResolvedPaintingAttachment;
  painting: Painting;
}) {
  const { t } = useTranslation();
  const actions = usePaintingViewerActions({
    currentOutput: current,
    painting,
  });

  return (
    <>
      <PaintingViewerChrome
        aspectRatios={paintingViewer.aspectRatios}
        onDelete={() => void actions.remove()}
        onDownload={() => void actions.download()}
        onEdit={actions.edit}
        onResizeSelect={actions.resize}
        onViewConversation={actions.viewConversation}
      />
      <View className="flex-1">
        <PaintingViewerImage accessibilityLabel={t('painting.output')} uri={current.uri} />
      </View>
    </>
  );
}

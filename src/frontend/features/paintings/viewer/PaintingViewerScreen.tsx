/* oxlint-disable react/style-prop-object -- Expo StatusBar style is a string union. */
import { ContentState, Spinner } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import {
  type ResolvedPaintingAttachment,
  usePainting,
  useResolvedPaintingFiles,
} from '@/frontend/data/paintings/usePaintings';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';
import { paintingViewer } from '@/frontend/utils/constants';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';
import type { Painting } from '@/shared/data/types/painting';

import { PaintingViewerChrome } from './components/PaintingViewerChrome';
import { PaintingViewerImage } from './components/PaintingViewerImage';
import { usePaintingViewerActions } from './hooks/usePaintingViewerActions';

export function PaintingViewerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
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
  const closeViewer = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/drawings');
    }
  }, [router]);

  if (!painting.data || !current) {
    if (!painting.isLoading && !files.isLoading) {
      return (
        <View className="flex-1 bg-background">
          <StatusBar style="auto" />
          <RouteHeader onBack={closeViewer} />
          <View className="flex-1 justify-center px-8 py-16">
            <ContentState.Error
              description={t('painting.viewer.unavailableDescription')}
              primaryAction={{ children: t('common.back'), onPress: closeViewer }}
              prominence="prominent"
              title={t('painting.viewer.unavailable')}
            />
          </View>
        </View>
      );
    }

    return (
      <View className="flex-1 bg-constant-black">
        <StatusBar style="light" />
        <View className="flex-1 items-center justify-center">
          <Spinner
            accessibilityLabel={t('painting.viewer.loading')}
            accessibilityRole="progressbar"
            color={constantWhite}
          />
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

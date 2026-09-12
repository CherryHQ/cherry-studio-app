import { ContentState } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useBackgroundTaskNotifications } from '@/frontend/appShell/backgroundActivity';
import { RouteHeader } from '@/frontend/appShell/header';
import { usePainting, useResolvedPaintingFiles } from '@/frontend/data/paintings/usePaintings';
import { consumePaintingDraftHandoff } from '@/frontend/utils/paintingDraftHandoff';
import { getSingleRouteParam } from '@/frontend/utils/routeParams';

import { PaintingComposer } from './components/PaintingComposer';
import { paintingOpenState } from './utils/paintingOpenState';

export function PaintingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  // Screen-scoped rather than `router.setParams`: the receipt id can land after
  // the user has already navigated away, and the router's version would write
  // it into whatever route is focused by then.
  // `RootParamList` is empty here (no generated route types), so the default
  // `setParams` signature takes `undefined`; name the params this screen owns.
  const navigation = useNavigation<{
    setParams(params: { handoff: undefined; paintingId: string | undefined }): void;
  }>();
  const params = useLocalSearchParams<{
    handoff?: string | string[];
    paintingId?: string | string[];
  }>();
  const handoffToken = getSingleRouteParam(params.handoff);
  const paintingId = getSingleRouteParam(params.paintingId);
  const [handoff] = useState(() => consumePaintingDraftHandoff(handoffToken));
  // Opening a persisted painting gates the composer on its data. The gate closes
  // for good once that data has seeded the composer: a generation later writes
  // its receipt id into the route, and re-entering the gate would tear the
  // composer down mid-generation.
  const [isOpeningPainting, setIsOpeningPainting] = useState(paintingId !== undefined);
  const paintingQuery = usePainting(paintingId);
  const painting = paintingQuery.data;
  // A handoff (edit / resize / album) already seeds the composer — the source
  // image rides in as an input attachment — so the painting's own resolved files
  // must not surface: the canvas stays blank for the fresh result instead of
  // echoing the old output back at the user. Skip resolving them entirely then.
  const filesQuery = useResolvedPaintingFiles(handoff ? undefined : painting);
  const openState = isOpeningPainting
    ? paintingOpenState({
        files: filesQuery.data,
        filesError: filesQuery.error,
        hasHandoff: Boolean(handoff),
        isFilesLoading: filesQuery.isLoading,
        isPaintingLoading: paintingQuery.isLoading,
        painting,
        paintingError: paintingQuery.error,
      })
    : 'ready';
  // Render-phase adjustment (not an effect): the guard makes the setState
  // idempotent, so the extra render pass converges immediately.
  if (isOpeningPainting && openState === 'ready') {
    setIsOpeningPainting(false);
  }
  const paintingFiles = filesQuery.data ?? { inputs: [], outputs: [] };
  useBackgroundTaskNotifications(
    paintingId ? { kind: 'painting', paintingId } : undefined,
    !handoffToken && Boolean(painting) && openState !== 'loading',
  );
  const handleReceipt = useCallback(
    // Admission changes the draft's route identity to its own task. Keep its
    // mounted composer state, but stop identifying it with the source painting.
    (receiptId: string | undefined) =>
      navigation.setParams({ handoff: undefined, paintingId: receiptId }),
    [navigation],
  );
  const initialAttachments = handoff?.attachments ?? [];
  const initialDraft = handoff?.draft ?? '';

  return (
    <View className="flex-1">
      <RouteHeader />
      {openState === 'loading' ? (
        <View className="flex-1 justify-center">
          <ContentState.Loading />
        </View>
      ) : openState === 'ready' ? (
        <PaintingComposer
          initialAttachments={initialAttachments}
          initialDraft={initialDraft}
          initialFiles={paintingFiles}
          initialParamValues={handoff?.paramValues}
          isHandoff={Boolean(handoff)}
          onReceipt={handleReceipt}
          painting={painting}
        />
      ) : (
        <View className="flex-1 justify-center px-8 py-16">
          <ContentState.Error
            title={t(openState === 'loadFailed' ? 'painting.loadFailed' : 'painting.unavailable')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => {
                void paintingQuery.refetch();
                void filesQuery.refetch();
              },
            }}
            secondaryAction={{
              children: t('common.back'),
              onPress: () => (router.canGoBack() ? router.back() : router.replace('/drawings')),
            }}
          />
        </View>
      )}
    </View>
  );
}

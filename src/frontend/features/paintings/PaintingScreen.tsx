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
  // Frozen at mount: only the painting this screen opened with owns the loading
  // gate. A generation writes a new receipt id into the route; letting that id
  // re-enter the gate would tear the composer down mid-generation.
  const [openedPaintingId] = useState(() => paintingId);
  const [hasOpenedPainting, setHasOpenedPainting] = useState(paintingId === undefined);
  const [handoff] = useState(() => consumePaintingDraftHandoff(handoffToken));
  const paintingQuery = usePainting(paintingId);
  const painting = paintingQuery.data;
  // A handoff (edit / resize / album) already seeds the composer — the source
  // image rides in as an input attachment — so the painting's own resolved files
  // must not surface: the canvas stays blank for the fresh result instead of
  // echoing the old output back at the user. Skip resolving them entirely then.
  const filesQuery = useResolvedPaintingFiles(handoff ? undefined : painting);
  const paintingFiles = filesQuery.data ?? { inputs: [], outputs: [] };
  const isLoading =
    !hasOpenedPainting &&
    openedPaintingId !== undefined &&
    paintingId === openedPaintingId &&
    (paintingQuery.isLoading || filesQuery.isLoading);
  useBackgroundTaskNotifications(
    paintingId ? { kind: 'painting', paintingId } : undefined,
    !handoffToken && Boolean(painting) && !isLoading,
  );
  const handleReceipt = useCallback(
    // Admission changes the draft's route identity to its own task. Keep its
    // mounted composer state, but stop identifying it with the source painting.
    (receiptId: string | undefined) =>
      navigation.setParams({ handoff: undefined, paintingId: receiptId }),
    [navigation],
  );
  const isOpeningPainting =
    !hasOpenedPainting && openedPaintingId !== undefined && paintingId === openedPaintingId;
  const loadError =
    isOpeningPainting &&
    ((!painting && paintingQuery.error) || (!handoff && !filesQuery.data && filesQuery.error));
  const hasUnavailableOutputs =
    !handoff &&
    painting &&
    painting.files.output.length > 0 &&
    filesQuery.data?.outputs.length === 0;
  const isUnavailable = isOpeningPainting && !isLoading && (!painting || hasUnavailableOutputs);
  if (
    isOpeningPainting &&
    !isLoading &&
    !loadError &&
    !isUnavailable &&
    painting &&
    (handoff || filesQuery.data)
  ) {
    setHasOpenedPainting(true);
  }
  const initialAttachments = handoff?.attachments ?? [];
  const initialDraft = handoff?.draft ?? '';

  return (
    <View className="flex-1">
      <RouteHeader />
      {isLoading ? (
        <View className="flex-1 justify-center">
          <ContentState.Loading />
        </View>
      ) : loadError || isUnavailable ? (
        <View className="flex-1 justify-center px-8 py-16">
          <ContentState.Error
            title={t(loadError ? 'painting.loadFailed' : 'painting.unavailable')}
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
      ) : (
        <PaintingComposer
          initialAttachments={initialAttachments}
          initialDraft={initialDraft}
          initialFiles={paintingFiles}
          initialParamValues={handoff?.paramValues}
          isHandoff={Boolean(handoff)}
          onReceipt={handleReceipt}
          painting={painting}
        />
      )}
    </View>
  );
}

import { Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ManagedComposerProvider } from '@/frontend/components/composer';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { PaintingComposer } from './components/PaintingComposer';
import { usePainting, useResolvedPaintingFiles } from './hooks/usePaintings';
import { consumePaintingDraftHandoff } from './utils/paintingDraftHandoff';

export function PaintingScreen() {
  // Screen-scoped rather than `router.setParams`: the receipt id can land after
  // the user has already navigated away, and the router's version would write
  // it into whatever route is focused by then.
  // `RootParamList` is empty here (no generated route types), so the default
  // `setParams` signature takes `undefined`; name the params this screen owns.
  const navigation = useNavigation<{
    setParams(params: { paintingId: string | undefined }): void;
  }>();
  const params = useLocalSearchParams<{
    handoff?: string | string[];
    paintingId?: string | string[];
  }>();
  const handoffToken = firstParam(params.handoff);
  const paintingId = firstParam(params.paintingId);
  // Frozen at mount: only the painting this screen opened with owns the loading
  // gate. A generation writes a new receipt id into the route; letting that id
  // re-enter the gate would tear the composer down mid-generation.
  const [openedPaintingId] = useState(() => paintingId);
  const [handoff] = useState(() => consumePaintingDraftHandoff(handoffToken));
  const paintingQuery = usePainting(paintingId);
  const painting = paintingQuery.data;
  // A handoff (edit / resize / album) already seeds the composer — the source
  // image rides in as an input attachment — so the painting's own resolved files
  // must not surface: the canvas stays blank for the fresh result instead of
  // echoing the old output back at the user. Skip resolving them entirely then.
  const filesQuery = useResolvedPaintingFiles(handoff ? undefined : painting);
  const paintingFiles = filesQuery.data ?? { inputs: [], outputs: [] };
  const insets = useSafeAreaInsets();
  const isLoading =
    openedPaintingId !== undefined &&
    paintingId === openedPaintingId &&
    (paintingQuery.isLoading || filesQuery.isLoading);
  const backgroundColor = useThemeColor('background');
  const handleReceipt = useCallback(
    (receiptId: string | undefined) => navigation.setParams({ paintingId: receiptId }),
    [navigation],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: 'minimal',
          title: '',
          headerStyle: { backgroundColor },
        }}
      />
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <ManagedComposerProvider
          initialAttachments={handoff?.attachments ?? paintingFiles.inputs}
          initialDraft={handoff?.draft ?? painting?.prompt ?? ''}
        >
          <PaintingComposer
            initialFiles={paintingFiles}
            onReceipt={handleReceipt}
            painting={painting}
          />
        </ManagedComposerProvider>
      )}
    </View>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

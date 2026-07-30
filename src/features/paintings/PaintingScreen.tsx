import { Stack, useLocalSearchParams } from 'expo-router';
import { useThemeColor } from 'heroui-native/hooks';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatInputProvider } from '@/features/chat/input';
import { usePainting, useResolvedPaintingFiles } from '@/features/paintings/hooks/usePaintings';
import { PaintingComposer } from './components/PaintingComposer';
import { consumePaintingDraftHandoff } from './utils/paintingDraftHandoff';

export function PaintingScreen() {
  const params = useLocalSearchParams<{
    handoff?: string | string[];
    paintingId?: string | string[];
  }>();
  const handoffToken = firstParam(params.handoff);
  const paintingId = firstParam(params.paintingId);
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
  const isLoading = Boolean(paintingId) && (paintingQuery.isLoading || filesQuery.isLoading);
  const backgroundColor = useThemeColor('background');

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
        <ChatInputProvider
          initialAttachments={handoff?.attachments ?? paintingFiles.inputs}
          initialDraft={handoff?.draft ?? painting?.prompt ?? ''}
        >
          <PaintingComposer initialFiles={paintingFiles} painting={painting} />
        </ChatInputProvider>
      )}
    </View>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

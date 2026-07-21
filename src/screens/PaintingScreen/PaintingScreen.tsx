import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePainting, useResolvedPaintingFiles } from '@/hooks/paintings';
import { ChatInputProvider } from '@/screens/ChatScreen/input/context/ChatInputProvider';
import { PaintingComposer } from './components/PaintingComposer';
import { consumePaintingDraftHandoff } from './utils/paintingDraftHandoff';

export function PaintingScreen() {
  const params = useLocalSearchParams<{
    handoff?: string | string[];
    paintingId?: string | string[];
  }>();
  const handoffToken = firstParam(params.handoff);
  const paintingId = firstParam(params.paintingId);
  const [handoffAttachments] = useState(() => consumePaintingDraftHandoff(handoffToken));
  const paintingQuery = usePainting(paintingId);
  const painting = paintingQuery.data;
  const filesQuery = useResolvedPaintingFiles(painting);
  const insets = useSafeAreaInsets();
  const isLoading = Boolean(paintingId) && (paintingQuery.isLoading || filesQuery.isLoading);

  return (
    <View className="flex-1 bg-background" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: 'minimal',
          title: '',
        }}
      />
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <ChatInputProvider
          initialAttachments={painting ? (filesQuery.data?.inputs ?? []) : handoffAttachments}
          initialDraft={painting?.prompt ?? ''}
        >
          <PaintingComposer
            initialFiles={filesQuery.data ?? { inputs: [], outputs: [] }}
            painting={painting}
          />
        </ChatInputProvider>
      )}
    </View>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

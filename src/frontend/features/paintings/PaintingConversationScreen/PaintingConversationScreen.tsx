import * as Crypto from 'expo-crypto';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import {
  ComposerDock,
  ManagedComposerProvider,
  useComposerDockLayout,
} from '@/frontend/components/composer';
import { MessageList } from '@/frontend/components/messagePresentation';
import { isIOS } from '@/frontend/utils/constants';

import { PaintingInput } from '../components/PaintingInput';
import {
  type PaintingGenerationInput,
  type PaintingGenerationResult,
  usePaintingGeneration,
} from '../hooks/usePaintingGeneration';
import { usePainting, useResolvedPaintingFiles } from '../hooks/usePaintings';
import {
  createPaintingConversationMessages,
  createPendingPaintingConversationMessages,
} from './utils/paintingConversationMessages';

type PendingTurn = {
  assistantMessageId: string;
  input: PaintingGenerationInput;
  userMessageId: string;
};

export function PaintingConversationScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ paintingId?: string | string[] }>();
  const paintingId = firstParam(params.paintingId);
  const paintingQuery = usePainting(paintingId);
  const filesQuery = useResolvedPaintingFiles(paintingQuery.data);
  const painting = paintingQuery.data;
  const files = filesQuery.data;
  const isLoading = paintingQuery.isLoading || (Boolean(painting) && filesQuery.isLoading);
  const hasLoadError =
    !paintingId ||
    paintingQuery.isError ||
    filesQuery.isError ||
    (!isLoading && (!painting || !files || files.outputs.length === 0));

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerBackButtonDisplayMode: 'minimal',
          title: t('painting.conversation.title'),
        }}
      />
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : hasLoadError || !painting || !files ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text selectable className="text-center text-foreground text-sm">
            {t('painting.conversation.loadFailed')}
          </Text>
        </View>
      ) : (
        <ManagedComposerProvider key={painting.id}>
          <PaintingConversationWorkspace files={files} painting={painting} />
        </ManagedComposerProvider>
      )}
    </View>
  );
}

function PaintingConversationWorkspace({
  files,
  painting,
}: {
  files: NonNullable<ReturnType<typeof useResolvedPaintingFiles>['data']>;
  painting: NonNullable<ReturnType<typeof usePainting>['data']>;
}) {
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
  const { cancel, generate, status } = usePaintingGeneration({ initialOutputs: [] });
  const { contentBottomInset, handleInputHeightChange, inputHeightShared, keyboardOffset } =
    useComposerDockLayout();
  const messages = useMemo(
    () =>
      pendingTurn
        ? createPendingPaintingConversationMessages(pendingTurn)
        : createPaintingConversationMessages(painting, files),
    [files, painting, pendingTurn],
  );
  const handleGenerate = useCallback(
    async (input: PaintingGenerationInput) => {
      setPendingTurn({
        assistantMessageId: Crypto.randomUUID(),
        input,
        userMessageId: Crypto.randomUUID(),
      });
      try {
        return await generate(input);
      } catch (error) {
        setPendingTurn(null);
        throw error;
      }
    },
    [generate],
  );
  const handleGenerated = useCallback(
    (result: PaintingGenerationResult) => {
      setPendingTurn(null);
      router.replace({
        params: { paintingId: result.painting.id },
        pathname: '/paintings/[paintingId]/conversation',
      });
    },
    [router],
  );

  return (
    <View className="flex-1 bg-background">
      <MessageList
        bottomAccessoryHeight={inputHeightShared}
        contentBottomInset={contentBottomInset}
        contentTopInset={isIOS ? headerHeight : 0}
        enteringMessageId={pendingTurn?.userMessageId}
        keyboardOffset={keyboardOffset}
        messages={messages}
      />
      <ComposerDock onHeightChange={handleInputHeightChange}>
        <PaintingInput
          onCancel={cancel}
          onGenerate={handleGenerate}
          onGenerated={handleGenerated}
          painting={painting}
          status={status}
        />
      </ComposerDock>
    </View>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

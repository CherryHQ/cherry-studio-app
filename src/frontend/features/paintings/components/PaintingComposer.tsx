import { useComposerDockLayout } from '@cherrystudio/ui/components';
import * as Crypto from 'expo-crypto';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ComposerDock, ComposerSessionProvider } from '@/frontend/components/composer';
import type { ComposerInitialAttachment } from '@/frontend/components/composer/utils/composerAttachments';
import { MessageList, type MessageListItem } from '@/frontend/components/messages';
import { resolveHeaderContentInset } from '@/frontend/components/navigation';
import type { Painting } from '@/shared/data/types/painting';

import {
  type PaintingGenerationInput,
  usePaintingGeneration,
} from '../hooks/usePaintingGeneration';
import { paintingJobParamValues, usePaintingJobs } from '../hooks/usePaintingJobs';
import type { ResolvedPaintingFiles } from '../hooks/usePaintings';
import { imageParamsResolutionLabel } from '../utils/imageGenerationParams';
import { createPaintingMessages } from '../utils/paintingMessages';
import { PaintingInput } from './PaintingInput';
import { PaintingMessage, type PaintingMessageState } from './PaintingMessage';

type ActivePaintingTurn = {
  assistantMessageId: string;
  input: PaintingGenerationInput;
  paintingId?: string;
  userMessageId: string;
};

export function PaintingComposer({
  initialAttachments,
  initialDraft,
  initialFiles,
  isHandoff,
  onReceipt,
  painting,
}: {
  initialAttachments: readonly ComposerInitialAttachment[];
  initialDraft: string;
  initialFiles: ResolvedPaintingFiles;
  isHandoff: boolean;
  onReceipt?: (paintingId: string | undefined) => void;
  painting?: Painting;
}) {
  const { t } = useTranslation();
  const headerHeight = useHeaderHeight();
  const [activeTurn, setActiveTurn] = useState<ActivePaintingTurn | null>(null);
  const [showPersistedTurn, setShowPersistedTurn] = useState(!isHandoff);
  const receiptId = painting && painting.files.output.length === 0 ? painting.id : undefined;
  const generation = usePaintingGeneration({
    initialAspectRatio: initialFiles.outputAspectRatio,
    initialOutputs: initialFiles.outputs,
    onReceipt,
    paintingId: receiptId,
  });
  const jobs = usePaintingJobs();
  const initialParamValues = receiptId
    ? paintingJobParamValues(
        jobs.activeByPaintingId.get(receiptId) ?? jobs.interruptedByPaintingId.get(receiptId),
      )
    : undefined;
  const generationResolution =
    imageParamsResolutionLabel(generation.paramValues ?? initialParamValues) ??
    t('painting.settings.option.auto');
  const outputs = generation.outputs.length > 0 ? generation.outputs : initialFiles.outputs;
  const firstOutput = outputs[0];
  const failure = generation.error ?? generation.interruption;
  const assistantStatus =
    generation.status === 'generating' || (!firstOutput && !failure)
      ? 'pending'
      : failure
        ? 'error'
        : 'success';

  const messages = useMemo(() => {
    if (activeTurn) {
      return createPaintingMessages({
        assistantMessageId: activeTurn.assistantMessageId,
        assistantStatus,
        attachments: activeTurn.input.attachments,
        prompt: activeTurn.input.prompt,
        userMessageId: activeTurn.userMessageId,
      });
    }

    if (!showPersistedTurn || !painting) {
      return [];
    }

    return createPaintingMessages({
      assistantMessageId: firstOutput?.fileEntryId ?? `${painting.id}:assistant`,
      assistantStatus,
      attachments: initialFiles.inputs,
      prompt: painting.prompt,
      userMessageId: painting.id,
    });
  }, [activeTurn, assistantStatus, firstOutput, initialFiles.inputs, painting, showPersistedTurn]);

  const handleGenerate = useCallback(
    async (input: PaintingGenerationInput) => {
      setShowPersistedTurn(false);
      setActiveTurn({
        assistantMessageId: Crypto.randomUUID(),
        input,
        userMessageId: Crypto.randomUUID(),
      });

      const result = await generation.generate(input);
      if (!result) {
        setActiveTurn(null);
        return null;
      }

      setActiveTurn((current) =>
        current ? { ...current, paintingId: result.painting.id } : current,
      );
      return result;
    },
    [generation.generate],
  );
  const messageRenderState = useMemo<PaintingMessageState>(
    () => ({
      animateOutput:
        firstOutput?.fileEntryId !== undefined &&
        firstOutput.fileEntryId !== initialFiles.outputs[0]?.fileEntryId,
      aspectRatio: generation.aspectRatio,
      error: generation.error,
      interruption: generation.interruption,
      outputs,
      paintingId: activeTurn?.paintingId ?? (showPersistedTurn ? painting?.id : undefined),
      resolution: generationResolution,
      status: generation.status,
    }),
    [
      activeTurn?.paintingId,
      generation.aspectRatio,
      generation.error,
      generation.interruption,
      generation.status,
      generationResolution,
      initialFiles.outputs,
      firstOutput,
      outputs,
      painting?.id,
      showPersistedTurn,
    ],
  );
  const renderMessage = useCallback(
    (message: MessageListItem) => <PaintingMessage message={message} state={messageRenderState} />,
    [messageRenderState],
  );
  const { contentBottomInset, handleInputHeightChange, inputHeightShared, keyboardOffset } =
    useComposerDockLayout();
  const composerKey = firstOutput?.fileEntryId ?? 'painting-composer';
  const composerInitialAttachments = firstOutput ? [] : initialAttachments;
  const composerInitialDraft = firstOutput ? '' : initialDraft;

  return (
    <View className="flex-1 bg-background">
      <MessageList
        bottomAccessoryHeight={inputHeightShared}
        contentBottomInset={contentBottomInset}
        contentTopInset={resolveHeaderContentInset(headerHeight)}
        enteringMessageId={activeTurn?.userMessageId}
        extraData={messageRenderState}
        keyboardOffset={keyboardOffset}
        messages={messages}
        renderMessage={renderMessage}
      />
      <ComposerSessionProvider
        initialAttachments={composerInitialAttachments}
        initialDraft={composerInitialDraft}
        key={composerKey}
      >
        <ComposerDock onHeightChange={handleInputHeightChange}>
          <PaintingInput
            initialParamValues={initialParamValues}
            onCancel={generation.cancel}
            onGenerate={handleGenerate}
            painting={painting}
            status={generation.status}
          />
        </ComposerDock>
      </ComposerSessionProvider>
    </View>
  );
}

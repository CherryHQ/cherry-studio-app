import { composerContentGap, getComposerKeyboardStickyOffset } from '@cherrystudio/ui/components';
import * as Crypto from 'expo-crypto';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';
import {
  ComposerDismissArea,
  ComposerDock,
  ComposerSessionProvider,
  useComposerSendError,
} from '@/frontend/components/Composer';
import type { ComposerInitialAttachment } from '@/frontend/components/Composer/utils/composerAttachments';
import { MessageList, type MessageListItem } from '@/frontend/components/Message';
import { PaintingInput, PaintingInputProvider } from '@/frontend/components/PaintingInput';
import { paintingJobParamValues, usePaintingJobs } from '@/frontend/data/paintings/usePaintingJobs';
import type { ResolvedPaintingFiles } from '@/frontend/data/paintings/usePaintings';
import type { Painting } from '@/shared/data/types/painting';
import {
  type ImageParamDraft,
  imageParamsResolutionLabel,
} from '@/shared/utils/imageGenerationParams';

import {
  type PaintingGenerationInput,
  usePaintingGeneration,
} from '../hooks/usePaintingGeneration';
import { createPaintingMessages } from '../utils/paintingMessages';
import { PaintingAssistantMessage } from './PaintingAssistantMessage';
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
  initialFiles: resolvedFiles,
  initialParamValues,
  isHandoff,
  onReceipt,
  painting: resolvedPainting,
}: {
  initialAttachments: readonly ComposerInitialAttachment[];
  initialDraft: string;
  initialFiles: ResolvedPaintingFiles;
  initialParamValues?: ImageParamDraft;
  isHandoff: boolean;
  onReceipt?: (paintingId: string | undefined) => void;
  painting?: Painting;
}) {
  // Route updates follow each new receipt; only the opening record seeds this composer.
  const [{ initialFiles, painting }] = useState(() => ({
    initialFiles: resolvedFiles,
    painting: resolvedPainting,
  }));
  const { t } = useTranslation();
  const reportSendError = useComposerSendError({
    sendFailedLabel: t('painting.input.generateFailed'),
  });
  const headerHeight = useHeaderHeight();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const keyboardOffset = getComposerKeyboardStickyOffset(bottomInset);
  const isSubmittingRef = useRef(false);
  const [activeTurn, setActiveTurn] = useState<ActivePaintingTurn | null>(null);
  const [showPersistedTurn, setShowPersistedTurn] = useState(!isHandoff);
  const [previousResult, setPreviousResult] = useState<{
    activeTurn: ActivePaintingTurn | null;
    showPersistedTurn: boolean;
    state: PaintingMessageState;
  } | null>(null);
  const receiptId = painting && painting.files.output.length === 0 ? painting.id : undefined;
  const generation = usePaintingGeneration({
    initialAspectRatio: initialFiles.outputAspectRatio,
    initialOutputs: initialFiles.outputs,
    completedPaintingId: initialFiles.outputs.length > 0 ? painting?.id : undefined,
    onReceipt,
    paintingId: receiptId,
  });
  const generatePainting = generation.generate;
  const jobs = usePaintingJobs();
  const restoredParamValues = receiptId
    ? paintingJobParamValues(
        jobs.activeByPaintingId.get(receiptId) ?? jobs.interruptedByPaintingId.get(receiptId),
      )
    : undefined;
  const seededParamValues = initialParamValues ?? restoredParamValues;
  const generationResolution =
    imageParamsResolutionLabel(generation.paramValues ?? seededParamValues) ??
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
      if (isSubmittingRef.current || generation.status === 'generating') return null;
      isSubmittingRef.current = true;
      const restoreTurn = failure ? previousResult : { activeTurn, showPersistedTurn };
      if (!failure && outputs.length > 0 && messages.length > 0) {
        setPreviousResult({
          activeTurn,
          showPersistedTurn,
          state: {
            aspectRatio: generation.aspectRatio,
            error: null,
            interruption: null,
            outputs,
            paintingId: activeTurn?.paintingId ?? (showPersistedTurn ? painting?.id : undefined),
            prompt: activeTurn?.input.prompt ?? painting?.prompt ?? '',
            resolution: generationResolution,
            status: 'idle',
          },
        });
      }
      setShowPersistedTurn(false);
      setActiveTurn({
        assistantMessageId: Crypto.randomUUID(),
        input,
        userMessageId: Crypto.randomUUID(),
      });

      try {
        const result = await generatePainting(input);
        if (!result) {
          setActiveTurn(restoreTurn?.activeTurn ?? null);
          setShowPersistedTurn(restoreTurn?.showPersistedTurn ?? false);
          return null;
        }
        setActiveTurn((current) =>
          current ? { ...current, paintingId: result.paintingId } : current,
        );
        return result;
      } catch (error) {
        setActiveTurn(activeTurn);
        setShowPersistedTurn(showPersistedTurn);
        throw error;
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [
      activeTurn,
      failure,
      generatePainting,
      generation.aspectRatio,
      generation.status,
      generationResolution,
      messages.length,
      outputs,
      painting,
      previousResult,
      showPersistedTurn,
    ],
  );
  const retryInput = activeTurn?.input;
  const canRetry = Boolean(failure && retryInput);
  const messagePrompt = retryInput?.prompt ?? painting?.prompt ?? '';
  const handleRetry = useCallback(() => {
    if (!retryInput) {
      return;
    }

    void handleGenerate(retryInput).catch(reportSendError);
  }, [handleGenerate, retryInput, reportSendError]);
  const handleCancel = () => {
    void generation.cancel().then((cancelled) => {
      if (cancelled) {
        setActiveTurn(previousResult?.activeTurn ?? null);
        setShowPersistedTurn(previousResult?.showPersistedTurn ?? false);
      }
    });
  };
  const messageRenderState = useMemo<PaintingMessageState>(
    () => ({
      animateOutput:
        firstOutput?.fileEntryId !== undefined &&
        firstOutput.fileEntryId !== initialFiles.outputs[0]?.fileEntryId,
      aspectRatio: generation.aspectRatio,
      error: generation.error,
      interruption: generation.interruption,
      onRetry: canRetry ? handleRetry : undefined,
      outputs,
      paintingId: activeTurn?.paintingId ?? (showPersistedTurn ? painting?.id : undefined),
      prompt: messagePrompt,
      resolution: generationResolution,
      status: generation.status,
    }),
    [
      activeTurn?.paintingId,
      canRetry,
      generation.aspectRatio,
      generation.error,
      generation.interruption,
      generation.status,
      generationResolution,
      handleRetry,
      initialFiles.outputs,
      firstOutput,
      messagePrompt,
      outputs,
      painting?.id,
      showPersistedTurn,
    ],
  );
  const renderMessage = useCallback(
    (message: MessageListItem) => (
      <View className="gap-3">
        {message.role === 'assistant' && failure && previousResult ? (
          <PaintingAssistantMessage {...previousResult.state} animateOutput={false} />
        ) : null}
        <PaintingMessage message={message} state={messageRenderState} />
      </View>
    ),
    [failure, messageRenderState, previousResult],
  );
  // Results belong to the message list. Only an explicit handoff or an
  // unfinished receipt seeds the draft; finishing a job must not remount it.
  const composerInitialAttachments =
    initialAttachments.length > 0 ? initialAttachments : receiptId ? initialFiles.inputs : [];
  const composerInitialDraft = initialDraft || (receiptId ? (painting?.prompt ?? '') : '');

  return (
    <ComposerSessionProvider
      initialAttachments={composerInitialAttachments}
      initialDraft={composerInitialDraft}
    >
      <PaintingInputProvider
        result={
          outputs.length > 0
            ? {
                id: JSON.stringify(outputs.map((output) => output.fileEntryId)),
                images: outputs,
              }
            : undefined
        }
      >
        <ComposerDismissArea>
          <MessageList
            contentBottomInset={composerContentGap}
            contentTopInset={resolveHeaderContentInset(headerHeight)}
            enteringMessageId={activeTurn?.userMessageId}
            extraData={messageRenderState}
            keyboardOffset={keyboardOffset}
            keyboardShouldPersistTaps="always"
            messages={messages}
            renderMessage={renderMessage}
          />
        </ComposerDismissArea>
        <ComposerDock layoutMode="flow">
          <PaintingInput
            initialParamValues={seededParamValues}
            onCancel={handleCancel}
            onGenerate={handleGenerate}
            painting={painting}
            status={generation.status}
          />
        </ComposerDock>
      </PaintingInputProvider>
    </ComposerSessionProvider>
  );
}

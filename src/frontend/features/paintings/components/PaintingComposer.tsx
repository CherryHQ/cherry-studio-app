import { useComposerDockLayout } from '@cherrystudio/ui/components';
import * as Crypto from 'expo-crypto';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';
import {
  ComposerDismissArea,
  ComposerDock,
  ComposerSessionProvider,
  useComposerSendError,
} from '@/frontend/components/Composer';
import type { ComposerInitialAttachment } from '@/frontend/components/Composer/utils/composerAttachments';
import { MessageList, type MessageListItem } from '@/frontend/components/Message';
import {
  type ImageParamDraft,
  imageParamsResolutionLabel,
} from '@/frontend/data/paintings/imageGenerationParams';
import { paintingJobParamValues, usePaintingJobs } from '@/frontend/data/paintings/usePaintingJobs';
import type { ResolvedPaintingFiles } from '@/frontend/data/paintings/usePaintings';
import type { Painting } from '@/shared/data/types/painting';

import {
  type PaintingGenerationInput,
  usePaintingGeneration,
} from '../hooks/usePaintingGeneration';
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
  initialParamValues,
  isHandoff,
  onReceipt,
  painting,
}: {
  initialAttachments: readonly ComposerInitialAttachment[];
  initialDraft: string;
  initialFiles: ResolvedPaintingFiles;
  initialParamValues?: ImageParamDraft;
  isHandoff: boolean;
  onReceipt?: (paintingId: string | undefined) => void;
  painting?: Painting;
}) {
  const { t } = useTranslation();
  const reportSendError = useComposerSendError({
    sendFailedLabel: t('painting.input.generateFailed'),
  });
  const headerHeight = useHeaderHeight();
  const isSubmittingRef = useRef(false);
  const [activeTurn, setActiveTurn] = useState<ActivePaintingTurn | null>(null);
  const [showPersistedTurn, setShowPersistedTurn] = useState(!isHandoff);
  const receiptId = painting && painting.files.output.length === 0 ? painting.id : undefined;
  const generation = usePaintingGeneration({
    initialAspectRatio: initialFiles.outputAspectRatio,
    initialOutputs: initialFiles.outputs,
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
      setShowPersistedTurn(false);
      setActiveTurn({
        assistantMessageId: Crypto.randomUUID(),
        input,
        userMessageId: Crypto.randomUUID(),
      });

      try {
        const result = await generatePainting(input);
        if (!result) {
          setActiveTurn(null);
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
    [activeTurn, generatePainting, generation.status, showPersistedTurn],
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
        setActiveTurn(null);
        setShowPersistedTurn(false);
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
    (message: MessageListItem) => <PaintingMessage message={message} state={messageRenderState} />,
    [messageRenderState],
  );
  const { contentBottomInset, handleInputHeightChange, inputHeightShared, keyboardOffset } =
    useComposerDockLayout();
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
      <ComposerDismissArea>
        <MessageList
          bottomAccessoryHeight={inputHeightShared}
          contentBottomInset={contentBottomInset}
          contentTopInset={resolveHeaderContentInset(headerHeight)}
          enteringMessageId={activeTurn?.userMessageId}
          extraData={messageRenderState}
          keyboardOffset={keyboardOffset}
          keyboardShouldPersistTaps="always"
          messages={messages}
          renderMessage={renderMessage}
        />
      </ComposerDismissArea>
      <ComposerDock onHeightChange={handleInputHeightChange}>
        <PaintingInput
          initialParamValues={seededParamValues}
          onCancel={handleCancel}
          onGenerate={handleGenerate}
          painting={painting}
          status={generation.status}
        />
      </ComposerDock>
    </ComposerSessionProvider>
  );
}

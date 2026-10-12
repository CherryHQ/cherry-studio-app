import { composerContentGap, getComposerKeyboardStickyOffset } from '@cherrystudio/ui/components';
import * as Crypto from 'expo-crypto';
import { Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
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
import { PaintingWorkspaceInput, PaintingInputProvider } from '@/frontend/components/PaintingInput';
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
import type { PaintingAnnotation } from '../utils/paintingAnnotations';
import { createPaintingMessages } from '../utils/paintingMessages';
import { PaintingComparison, type PaintingComparisonImage } from './PaintingComparison';
import { PaintingImageEditor } from './PaintingImageEditor';
import { PaintingMessage, type PaintingMessageState } from './PaintingMessage';

type ActivePaintingTurn = {
  assistantMessageId: string;
  input: PaintingGenerationInput;
  paintingId?: string;
  userMessageId: string;
};

type ArchivedPaintingTurn = {
  messages: readonly MessageListItem[];
  state: PaintingMessageState;
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
  const firstAttachment = initialAttachments[0];
  const [editorOutput, setEditorOutput] = useState<{ fileEntryId?: string; uri: string } | null>(
    () =>
      isHandoff && initialAttachments.length === 1 && firstAttachment?.kind === 'image'
        ? firstAttachment
        : null,
  );
  const [isEditorOpen, setIsEditorOpen] = useState(Boolean(editorOutput));
  const annotationDrafts = useRef(new Map<string, readonly PaintingAnnotation[]>());
  const [editorAnnotations, setEditorAnnotations] = useState<readonly PaintingAnnotation[]>([]);
  const openEditor = useCallback((output: { fileEntryId: string; uri: string }) => {
    setEditorAnnotations(annotationDrafts.current.get(output.fileEntryId) ?? []);
    setEditorOutput(output);
    setIsEditorOpen(true);
  }, []);
  const [activeTurn, setActiveTurn] = useState<ActivePaintingTurn | null>(null);
  const [showPersistedTurn, setShowPersistedTurn] = useState(!isHandoff);
  const [archivedTurns, setArchivedTurns] = useState<readonly ArchivedPaintingTurn[]>([]);
  const [comparison, setComparison] = useState<{
    images: readonly PaintingComparisonImage[];
    initialOutput: string;
  } | null>(null);
  const isImmersive = isEditorOpen || comparison !== null;
  const [previousResult, setPreviousResult] = useState<{
    activeTurn: ActivePaintingTurn | null;
    showPersistedTurn: boolean;
    state: PaintingMessageState;
    archivedTurns: readonly ArchivedPaintingTurn[];
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

  const activeMessages = useMemo(() => {
    if (activeTurn) {
      return createPaintingMessages({
        assistantMessageId: activeTurn.assistantMessageId,
        assistantStatus,
        attachments: activeTurn.input.attachments,
        prompt: activeTurn.input.displayPrompt ?? activeTurn.input.prompt,
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
  const messages = useMemo(
    () => [...archivedTurns.flatMap((turn) => turn.messages), ...activeMessages],
    [activeMessages, archivedTurns],
  );

  const handleGenerate = useCallback(
    async (input: PaintingGenerationInput) => {
      if (isSubmittingRef.current || generation.status === 'generating') return null;
      isSubmittingRef.current = true;
      const restoreTurn = failure
        ? previousResult
        : { activeTurn, showPersistedTurn, archivedTurns };
      if (!failure && outputs.length > 0 && activeMessages.length > 0) {
        const snapshot = {
          activeTurn,
          showPersistedTurn,
          state: {
            aspectRatio: generation.aspectRatio,
            error: null,
            interruption: null,
            outputs,
            paintingId: activeTurn?.paintingId ?? (showPersistedTurn ? painting?.id : undefined),
            prompt:
              activeTurn?.input.displayPrompt ?? activeTurn?.input.prompt ?? painting?.prompt ?? '',
            resolution: generationResolution,
            modelName: activeTurn?.input.modelName ?? painting?.modelId?.split('::').at(-1),
            status: 'idle',
          } satisfies PaintingMessageState,
          archivedTurns,
        };
        setPreviousResult(snapshot);
        setArchivedTurns([...archivedTurns, { messages: activeMessages, state: snapshot.state }]);
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
          setArchivedTurns(restoreTurn?.archivedTurns ?? []);
          return null;
        }
        setActiveTurn((current) =>
          current ? { ...current, paintingId: result.paintingId } : current,
        );
        return result;
      } catch (error) {
        setActiveTurn(activeTurn);
        setShowPersistedTurn(showPersistedTurn);
        setArchivedTurns(archivedTurns);
        throw error;
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [
      activeTurn,
      activeMessages,
      archivedTurns,
      failure,
      generatePainting,
      generation.aspectRatio,
      generation.status,
      generationResolution,
      outputs,
      painting,
      previousResult,
      showPersistedTurn,
    ],
  );
  const retryInput = activeTurn?.input;
  const canRetry = Boolean(failure && retryInput);
  const messagePrompt = retryInput?.displayPrompt ?? retryInput?.prompt ?? painting?.prompt ?? '';
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
        setArchivedTurns(previousResult?.archivedTurns ?? []);
      }
    });
  };
  const comparisonImages = useMemo(
    () => [
      ...archivedTurns.flatMap((turn, index) =>
        turn.state.outputs.map((output, candidateIndex) => ({
          output,
          versionNumber: index + 1,
          candidateNumber: candidateIndex + 1,
        })),
      ),
      ...outputs.map((output, candidateIndex) => ({
        output,
        versionNumber: archivedTurns.length + 1,
        candidateNumber: candidateIndex + 1,
      })),
    ],
    [archivedTurns, outputs],
  );
  const openComparison = useCallback(
    (output: { fileEntryId: string; uri: string }) => {
      const images = [
        ...new Map(comparisonImages.map((image) => [image.output.fileEntryId, image])).values(),
      ];
      if (images.length > 1) setComparison({ images, initialOutput: output.fileEntryId });
    },
    [comparisonImages],
  );
  const currentModelName = activeTurn?.input.modelName ?? painting?.modelId?.split('::').at(-1);
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
      prompt: messagePrompt,
      resolution: generationResolution,
      modelName: currentModelName,
      status: generation.status,
    }),
    [
      activeTurn?.paintingId,
      currentModelName,
      generation.aspectRatio,
      generation.error,
      generation.interruption,
      generation.status,
      generationResolution,
      initialFiles.outputs,
      firstOutput,
      messagePrompt,
      outputs,
      painting?.id,
      showPersistedTurn,
    ],
  );
  const archivedMessages = useMemo(
    () =>
      new Map(
        archivedTurns.flatMap((turn, index) =>
          turn.messages.map(
            (message) => [message.id, { state: turn.state, versionNumber: index + 1 }] as const,
          ),
        ),
      ),
    [archivedTurns],
  );
  const renderState = useMemo(
    () => ({ ...messageRenderState, archivedTurns }),
    [archivedTurns, messageRenderState],
  );
  const renderMessage = useCallback(
    (message: MessageListItem) => {
      const archived = archivedMessages.get(message.id);
      return (
        <PaintingMessage
          archived={Boolean(archived)}
          message={message}
          state={archived?.state ?? messageRenderState}
          onRetry={!archived && canRetry ? handleRetry : undefined}
          onEditOutput={openEditor}
          onCompareOutput={comparisonImages.length > 1 ? openComparison : undefined}
          versionNumber={archived?.versionNumber ?? archivedTurns.length + 1}
        />
      );
    },
    [
      archivedMessages,
      archivedTurns.length,
      messageRenderState,
      canRetry,
      handleRetry,
      openEditor,
      openComparison,
      comparisonImages.length,
    ],
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
        <Stack.Screen options={{ headerShown: !isImmersive, gestureEnabled: !isImmersive }} />
        <View
          className="flex-1"
          accessibilityElementsHidden={isImmersive}
          importantForAccessibility={isImmersive ? 'no-hide-descendants' : 'auto'}
          pointerEvents={isImmersive ? 'none' : 'auto'}
        >
          {messages.length === 0 ? (
            <View
              className="absolute inset-0 items-center justify-center gap-3 px-8"
              pointerEvents="none"
            >
              <Text className="font-semibold text-foreground text-2xl">
                {t('painting.workspace.emptyTitle')}
              </Text>
              <Text className="text-center text-muted-foreground text-sm">
                {t('painting.workspace.emptyDescription')}
              </Text>
            </View>
          ) : null}
          <ComposerDismissArea>
            <MessageList
              contentBottomInset={composerContentGap}
              contentTopInset={resolveHeaderContentInset(headerHeight)}
              enteringMessageId={activeTurn?.userMessageId}
              extraData={renderState}
              keyboardOffset={keyboardOffset}
              keyboardShouldPersistTaps="always"
              messages={messages}
              renderMessage={renderMessage}
            />
          </ComposerDismissArea>
        </View>
        {!isImmersive ? (
          <ComposerDock layoutMode="flow">
            <PaintingWorkspaceInput
              initialParamValues={seededParamValues}
              onCancel={handleCancel}
              onGenerate={handleGenerate}
              painting={painting}
              status={generation.status}
            />
          </ComposerDock>
        ) : null}
        {comparison ? (
          <PaintingComparison
            images={comparison.images}
            initialOutput={comparison.initialOutput}
            onClose={() => setComparison(null)}
            onEdit={(output) => {
              setComparison(null);
              openEditor(output);
            }}
          />
        ) : null}
        {editorOutput && isEditorOpen ? (
          <PaintingImageEditor
            initialAnnotations={editorAnnotations}
            initialParamValues={seededParamValues}
            key={editorOutput.fileEntryId ?? editorOutput.uri}
            onAnnotationsChange={(annotations) =>
              annotationDrafts.current.set(
                editorOutput.fileEntryId ?? editorOutput.uri,
                annotations,
              )
            }
            onCancel={handleCancel}
            onClose={() => setIsEditorOpen(false)}
            onGenerate={handleGenerate}
            output={editorOutput}
            painting={painting}
            status={generation.status}
          />
        ) : null}
      </PaintingInputProvider>
    </ComposerSessionProvider>
  );
}

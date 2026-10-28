import {
  Composer,
  getComposerKeyboardStickyOffset,
  ImageGenerationLoader,
  useAlert,
  useComposerExpansion,
  useToast,
} from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  feedbackFailureContext,
  feedbackTimestamp,
  useFeedbackActions,
  useFeedbackSource,
  type FeedbackContextInput,
} from '@/frontend/appShell/feedback';
import {
  ComposerDock,
  ComposerSessionProvider,
  useComposerActions,
  useComposerPresentationActions,
  useComposerSendError,
} from '@/frontend/components/Composer';
import { useModelPickerData } from '@/frontend/components/ModelPicker';
import {
  PaintingInputProvider,
  type PaintingInputSubmission,
  PaintingWorkspaceInput,
} from '@/frontend/components/PaintingInput';
import { useMutation } from '@/frontend/data';
import { paintingJobParamValues } from '@/frontend/data/paintings/usePaintingJobs';
import { useDeletePaintings } from '@/frontend/data/paintings/usePaintings';
import { AiFailureSnapshotSchema, type AiFailureSnapshot } from '@/shared/contracts/aiFailure';
import { isUniqueModelId, parseUniqueModelId } from '@/shared/data/types/model';
import { diagnosticIdentifier } from '@/shared/utils/diagnosticIdentifier';
import { type ImageParamDraft, imageParamsAspectRatio } from '@/shared/utils/imageGenerationParams';

import { usePaintingAnnotationDraft } from '../hooks/usePaintingAnnotationDraft';
import {
  type PaintingBoardData,
  type PaintingBoardNode,
  usePaintingBoard,
} from '../hooks/usePaintingBoard';
import { retryableJobInput, usePaintingBoardGeneration } from '../hooks/usePaintingBoardGeneration';
import { usePaintingFocusReference } from '../hooks/usePaintingFocusReference';
import {
  paintingNodeChildren,
  paintingNodeId,
  paintingNodeParents,
} from '../utils/paintingBoardGraph';
import { PaintingBoardOverview } from './PaintingBoardOverview';
import { PaintingFocusCanvas } from './PaintingFocusCanvas';
import { PaintingFocusChrome } from './PaintingFocusChrome';
import { PaintingGenerationFailure } from './PaintingGenerationFailure';
import { PaintingGenerationInfoSheet } from './PaintingGenerationInfoSheet';
import { PaintingLineageStrip } from './PaintingLineageStrip';
import { PaintingOverviewChrome } from './PaintingOverviewChrome';

type Focus = { imageIndex: number; nodeId: string };

/**
 * One page for a whole painting board: the focused image fills the screen
 * (viewing, zooming, annotating and continuing all happen on it), the board
 * overview shows every generation and how they connect, and the composer
 * stays mounted across both so a draft survives moving around the board.
 */
export function PaintingBoardWorkspace({
  boardId,
  initialFocus,
  onClose,
  onReceipt,
}: {
  boardId: string | undefined;
  initialFocus?: { fileEntryId?: string; paintingId: string };
  onClose: () => void;
  onReceipt: (paintingId: string | undefined) => void;
}) {
  return (
    <ComposerSessionProvider>
      <Composer.Expansion>
        {/* The board attaches the focused image itself; a sent image never lingers. */}
        <PaintingInputProvider adoptSubmittedReference={false}>
          <PaintingBoardContent
            initialBoardId={boardId}
            initialFocus={initialFocus}
            onClose={onClose}
            onReceipt={onReceipt}
          />
        </PaintingInputProvider>
      </Composer.Expansion>
    </ComposerSessionProvider>
  );
}

function PaintingBoardContent({
  initialBoardId,
  initialFocus,
  onClose,
  onReceipt,
}: {
  initialBoardId: string | undefined;
  initialFocus?: { fileEntryId?: string; paintingId: string };
  onClose: () => void;
  onReceipt: (paintingId: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { openFeedback } = useFeedbackActions();
  const isScreenFocused = useIsFocused();
  const { alert } = useAlert();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const generation = usePaintingBoardGeneration(initialBoardId);
  const { boardId } = generation;
  const board = usePaintingBoard(boardId);
  const deletePaintings = useDeletePaintings();
  const reportError = useComposerSendError({ sendFailedLabel: t('painting.input.generateFailed') });
  const { setDraft } = useComposerActions();
  const { dismissInput } = useComposerPresentationActions();
  const isEditorPresented = useComposerExpansion()?.state.isPresented ?? false;
  const models = useModelPickerData({ modelType: 'image' });
  // A board opened as a whole lands on its canvas; a specific image opens on that image.
  const [mode, setMode] = useState<'focus' | 'overview'>(() =>
    initialBoardId && !initialFocus ? 'overview' : 'focus',
  );
  const [isSelectionCleared, setIsSelectionCleared] = useState(false);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [pending, setPending] = useState<{
    paintingId: string;
    paramValues: ImageParamDraft;
  } | null>(null);

  const defaultFocus = defaultBoardFocus(board, initialFocus);
  const activeFocus = focus ?? defaultFocus;
  const focusedNode = activeFocus ? board.nodes.get(activeFocus.nodeId) : undefined;
  const isAwaitingNode =
    !focusedNode && pending !== null && activeFocus?.nodeId === paintingNodeId(pending.paintingId);
  const imageIndex = Math.min(
    activeFocus?.imageIndex ?? 0,
    Math.max(0, (focusedNode?.images.length ?? 1) - 1),
  );
  const focusedImage = focusedNode?.images[imageIndex];
  const previewNode = previewNodeId ? board.nodes.get(previewNodeId) : undefined;
  const shownImage = previewNode?.images[0] ?? focusedImage;
  const focusedPainting = focusedNode?.painting;
  useFeedbackSource(() => paintingFeedbackContext(mode === 'focus' ? focusedNode : undefined));
  const isGenerating = isAwaitingNode || focusedNode?.status.kind === 'generating';
  // On the canvas the selection is what the composer edits; clearing it starts a new branch.
  const selectedNodeId =
    mode === 'overview' && !isSelectionCleared ? (activeFocus?.nodeId ?? null) : null;

  const referenceImage =
    (mode === 'focus' || selectedNodeId !== null) && focusedNode?.status.kind === 'ready'
      ? (focusedImage ?? null)
      : null;
  usePaintingFocusReference(referenceImage);
  // Notes are drawn on the full-screen image, so only it can send them.
  const annotationKey = mode === 'focus' ? (referenceImage?.fileEntryId ?? null) : null;
  const annotation = usePaintingAnnotationDraft(annotationKey);
  const hasAnnotations = annotation.annotations.length > 0;
  const showBoardChrome = !isEditorPresented;

  // Remember where the user was, so reopening the board lands there.
  const { trigger: updateBoard } = useMutation('PATCH', '/painting-boards/:id', {
    // The gallery orders boards by their latest change, and renames show there too.
    refresh: ['/painting-boards'],
    onSuccess: (updated) => {
      queryClient.setQueryData([`/painting-boards/${updated.id}`], updated);
    },
  });
  const focusedPaintingId = focusedNode?.kind === 'painting' ? focusedNode.paintingId : undefined;
  // Save each focus transition, including a return while the previous save is pending.
  useEffect(() => {
    if (!boardId || !focusedPaintingId) return;
    void updateBoard({
      body: { focusPaintingId: focusedPaintingId },
      params: { id: boardId },
    }).catch(() => undefined);
  }, [boardId, focusedPaintingId, updateBoard]);

  const focusNode = useCallback((nodeId: string, nextImageIndex = 0) => {
    setFocus({ imageIndex: nextImageIndex, nodeId });
    setPreviewNodeId(null);
    setMode('focus');
  }, []);
  const selectNode = useCallback((nodeId: string) => {
    setFocus({ imageIndex: 0, nodeId });
    setIsSelectionCleared(false);
  }, []);
  const openCanvas = useCallback(() => {
    setIsSelectionCleared(false);
    setMode('overview');
  }, []);

  const handleGenerate = useCallback(
    async (input: PaintingInputSubmission) => {
      const started = await generation.generate(input);
      if (annotationKey && input.attachments.some((item) => item.fileEntryId === annotationKey)) {
        annotation.clearSubmitted(annotationKey);
      }
      setPending({ paintingId: started.paintingId, paramValues: input.paramValues });
      // The new node appears where the request was made: selected on the canvas, or full screen.
      if (mode === 'overview') selectNode(paintingNodeId(started.paintingId));
      else focusNode(paintingNodeId(started.paintingId));
      onReceipt(started.paintingId);
      return started;
    },
    [annotation, annotationKey, focusNode, generation, mode, onReceipt, selectNode],
  );

  const handlePaintingRemoved = useCallback(
    (paintingId: string) => {
      const parents = paintingNodeParents(board.graph, paintingNodeId(paintingId));
      const nextPainting =
        board.paintings.find(({ id }) => parents.includes(paintingNodeId(id))) ??
        board.paintings.findLast(({ id }) => id !== paintingId);
      setPending(null);
      setFocus(nextPainting ? { imageIndex: 0, nodeId: paintingNodeId(nextPainting.id) } : null);
      onReceipt(nextPainting?.id);
    },
    [board.graph, board.paintings, onReceipt],
  );

  const handleCancel = useCallback(() => {
    if (!focusedPainting) return;
    void generation
      .cancel(focusedPainting.id, board.paintings.length === 1)
      .then(() => handlePaintingRemoved(focusedPainting.id))
      .catch(reportError);
  }, [board.paintings.length, focusedPainting, generation, handlePaintingRemoved, reportError]);

  const confirmDeleteNode = useCallback(() => {
    if (!focusedPainting) return;
    alert.confirm({
      confirmLabel: t('common.delete'),
      description: t('painting.focus.deleteMessage', {
        count: focusedPainting.files.output.length,
      }),
      onConfirm: async () => {
        const isLast = board.paintings.length <= 1;
        try {
          await deletePaintings([focusedPainting.id]);
          if (isLast) onClose();
          else handlePaintingRemoved(focusedPainting.id);
        } catch {
          toast.show({ label: t('painting.focus.deleteFailed'), variant: 'danger' });
        }
      },
      role: 'destructive',
      title: t('painting.focus.deleteTitle'),
    });
  }, [
    alert,
    board.paintings.length,
    deletePaintings,
    focusedPainting,
    handlePaintingRemoved,
    onClose,
    t,
    toast,
  ]);

  const renameBoard = useCallback(() => {
    if (!boardId || !board.board) return;
    alert.prompt({
      confirmLabel: t('common.save'),
      input: {
        accessibilityLabel: t('painting.board.rename'),
        autoFocus: true,
        initialValue: board.board.title,
        maxLength: 80,
      },
      onConfirm: (title) => {
        const trimmed = title.trim();
        if (!trimmed || trimmed === board.board?.title) return;
        void updateBoard({ body: { title: trimmed }, params: { id: boardId } })
          .then(() => board.refetch())
          .catch(() => toast.show({ label: t('painting.board.renameFailed'), variant: 'danger' }));
      },
      title: t('painting.board.rename'),
    });
  }, [alert, board, boardId, t, toast, updateBoard]);

  const { trigger: deleteBoardRequest } = useMutation('DELETE', '/painting-boards/:id', {
    refresh: ['/painting-boards'],
  });
  const confirmDeleteBoard = useCallback(() => {
    if (!boardId) return;
    alert.confirm({
      confirmLabel: t('common.delete'),
      description: t('painting.board.deleteMessage', { count: board.paintings.length }),
      onConfirm: async () => {
        try {
          await deleteBoardRequest({ params: { id: boardId } });
          onClose();
        } catch {
          toast.show({ label: t('painting.board.deleteFailed'), variant: 'danger' });
        }
      },
      role: 'destructive',
      title: t('painting.board.deleteTitle'),
    });
  }, [alert, board.paintings.length, boardId, deleteBoardRequest, onClose, t, toast]);

  const modelName = paintingModelName(focusedPainting?.modelId, models.getModelItem);
  const lastRatioPrompt = useRef<string | null>(null);
  const prepareRatioChange = useCallback(
    (ratio: string) => {
      // Ratio is a whole-image request; save a selected note before preparing it.
      annotation.selectAnnotation(null);
      const previous = lastRatioPrompt.current;
      const prompt = t('painting.focus.resizePrompt', { ratio });
      setDraft((current) => (!current.trim() || current === previous ? prompt : current));
      lastRatioPrompt.current = prompt;
    },
    [annotation, setDraft, t],
  );

  const retryFocused = useCallback(async () => {
    if (!focusedPainting || focusedNode?.status.kind !== 'stopped') return;
    await generation.retry(focusedPainting, focusedNode.status.job).catch(reportError);
  }, [focusedNode, focusedPainting, generation, reportError]);

  const parents = activeFocus
    ? paintingNodeParents(board.graph, activeFocus.nodeId).flatMap(
        (id) => board.nodes.get(id) ?? [],
      )
    : [];
  const childNodes = activeFocus
    ? paintingNodeChildren(board.graph, activeFocus.nodeId).flatMap(
        (id) => board.nodes.get(id) ?? [],
      )
    : [];

  // While typing, the image yields the space above the keyboard and composer.
  const dockHeight = useSharedValue(0);
  const { height: keyboardHeight, progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const keyboardOffset = getComposerKeyboardStickyOffset(insets.bottom);
  // Keep keyboard motion observable by every style, even when the dock height stays fixed.
  const keyboardLift = useDerivedValue(() =>
    Math.max(0, -keyboardHeight.get() - keyboardProgress.get() * keyboardOffset),
  );
  const canvasStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboardProgress.get() * (dockHeight.get() + 56) + keyboardLift.get(),
    paddingTop: keyboardProgress.get() * (insets.top + 56),
  }));
  const overlayStyle = useAnimatedStyle(() => ({
    bottom: dockHeight.get() + 10 + keyboardLift.get(),
  }));
  const generationStateStyle = useAnimatedStyle(() => ({
    paddingBottom: dockHeight.get() + 24 + keyboardLift.get(),
    paddingTop: insets.top + 64,
  }));

  const boardTitle = board.board?.title ?? t('painting.board.newBoard');
  const generationParams =
    (focusedNode?.status.kind === 'generating' || focusedNode?.status.kind === 'stopped'
      ? paintingJobParamValues(focusedNode.status.job)
      : undefined) ?? (isAwaitingNode ? pending?.paramValues : undefined);
  const loaderRatio = imageParamsAspectRatio(generationParams);
  const loaderWidth = Math.min(
    windowWidth - insets.left - insets.right - 48,
    windowHeight * 0.36 * loaderRatio,
  );

  let canvas;
  if (mode === 'overview' && boardId && board.isLoading) {
    // The canvas positions itself from the first layout it sees, so it waits for the board.
    canvas = <View className="flex-1" />;
  } else if (mode === 'overview' && boardId) {
    canvas = (
      <PaintingBoardOverview
        active={isScreenFocused && !isEditorPresented}
        board={board}
        modelName={(node) => paintingModelName(node.painting?.modelId, models.getModelItem)}
        onClearSelection={() => setIsSelectionCleared(true)}
        onOpen={focusNode}
        onSelect={selectNode}
        selectedNodeId={selectedNodeId}
      />
    );
  } else if (shownImage && (focusedNode?.status.kind === 'ready' || previewNode)) {
    canvas = (
      <Animated.View className="flex-1" style={canvasStyle}>
        <PaintingFocusCanvas
          accessibilityLabel={
            focusedPainting?.brief ?? focusedPainting?.prompt ?? t('painting.board.importedImage')
          }
          annotations={previewNode ? [] : annotation.annotations}
          canAnnotate={!previewNode && referenceImage !== null && !annotation.isSubmitting}
          imageCount={focusedNode?.images.length ?? 1}
          key={shownImage.uri}
          onAddAnnotation={annotation.addAnnotation}
          onRemoveAnnotation={annotation.removeAnnotation}
          onSelectAnnotation={annotation.selectAnnotation}
          onSwipe={(direction) => {
            if (!focusedNode || !activeFocus) return;
            const count = focusedNode.images.length;
            setFocus({
              imageIndex: (imageIndex + direction + count) % count,
              nodeId: activeFocus.nodeId,
            });
          }}
          selectedAnnotationId={annotation.selectedId}
          uri={shownImage.uri}
        />
      </Animated.View>
    );
  } else if (isGenerating) {
    canvas = (
      <Animated.View className="flex-1" style={generationStateStyle}>
        <ScrollView
          contentContainerClassName="grow items-center justify-center px-6 py-4"
          keyboardShouldPersistTaps="handled"
        >
          <Pressable className="items-center" onPress={dismissInput}>
            <ImageGenerationLoader
              accessibilityLabel={t('painting.status.generating')}
              active={isScreenFocused && !isEditorPresented}
              height={loaderWidth / loaderRatio}
              width={loaderWidth}
            />
          </Pressable>
        </ScrollView>
      </Animated.View>
    );
  } else if (focusedNode?.status.kind === 'stopped') {
    const canRetry = retryableJobInput(focusedNode.status.job) !== undefined;
    canvas = (
      <Animated.View className="flex-1" style={generationStateStyle}>
        <ScrollView
          contentContainerClassName="grow items-center justify-center px-6 py-4"
          keyboardShouldPersistTaps="handled"
        >
          <PaintingGenerationFailure
            failure={stoppedFailure(focusedNode)}
            height={loaderWidth / loaderRatio}
            key={focusedNode.id}
            message={focusedNode.status.job?.error?.message}
            onRetry={canRetry ? retryFocused : undefined}
            onReport={() => void openFeedback(paintingFeedbackContext(focusedNode))}
            prompt={focusedPainting?.brief ?? focusedPainting?.prompt}
            status={focusedNode.status.reason}
            width={loaderWidth}
          />
        </ScrollView>
      </Animated.View>
    );
  } else if (focusedNode) {
    canvas = (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-muted-foreground text-sm">
          {t('painting.focus.imageUnavailable')}
        </Text>
      </View>
    );
  } else {
    canvas = (
      <Pressable className="flex-1 items-center justify-center gap-2 px-8" onPress={dismissInput}>
        <Text className="font-semibold text-2xl text-foreground">
          {t('painting.workspace.emptyTitle')}
        </Text>
        <Text className="text-center text-muted-foreground text-sm">
          {t('painting.workspace.emptyDescription')}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-1">
      {showBoardChrome ? (
        mode === 'overview' ? (
          <PaintingOverviewChrome
            nodeCount={board.graph.nodes.length}
            onBack={onClose}
            onDelete={confirmDeleteBoard}
            onRename={renameBoard}
            title={boardTitle}
          />
        ) : (
          <PaintingFocusChrome
            boardTitle={boardTitle}
            image={focusedNode?.status.kind === 'ready' ? focusedImage : undefined}
            onBack={onClose}
            onDelete={focusedPainting ? confirmDeleteNode : undefined}
            onOpenOverview={boardId ? openCanvas : undefined}
            onShowInfo={focusedPainting ? () => setIsInfoOpen(true) : undefined}
          />
        )
      ) : null}
      {/* iOS toolbar composition forces the native header visible while mounted. */}
      <Stack.Screen options={{ headerShown: showBoardChrome }} />
      <View
        accessibilityElementsHidden={isEditorPresented}
        className="absolute inset-0"
        importantForAccessibility={isEditorPresented ? 'no-hide-descendants' : 'auto'}
        pointerEvents={isEditorPresented ? 'none' : 'auto'}
      >
        {canvas}
      </View>
      {showBoardChrome && mode === 'focus' ? (
        <Animated.View
          className="absolute right-0 left-0 gap-2 px-4"
          pointerEvents="box-none"
          style={overlayStyle}
        >
          {(focusedNode?.images.length ?? 0) > 1 && !hasAnnotations ? (
            <View className="items-end" pointerEvents="none">
              <View className="rounded-full bg-constant-black/55 px-3 py-1">
                <Text className="text-constant-white text-xs">
                  {imageIndex + 1} / {focusedNode?.images.length}
                </Text>
              </View>
            </View>
          ) : null}
          {hasAnnotations ? (
            <View className="flex-row flex-wrap justify-center gap-1.5">
              <AnnotationChip
                label={t('painting.focus.wholeImage')}
                onPress={() => annotation.selectAnnotation(null)}
                selected={annotation.selectedId === null}
              />
              {annotation.annotations.map((item) => (
                <AnnotationChip
                  key={item.id}
                  label={t('painting.editor.annotation', { number: item.id })}
                  onPress={() => annotation.selectAnnotation(item.id)}
                  selected={annotation.selectedId === item.id}
                />
              ))}
            </View>
          ) : (
            <PaintingLineageStrip
              childNodes={childNodes}
              current={focusedNode}
              onFocus={(nodeId) => focusNode(nodeId)}
              onPreview={setPreviewNodeId}
              parents={parents}
            />
          )}
        </Animated.View>
      ) : null}
      <ComposerDock layoutMode="expandable" onHeightChange={(height) => dockHeight.set(height)}>
        <PaintingWorkspaceInput
          onCancel={handleCancel}
          onGenerate={handleGenerate}
          onRatioChange={prepareRatioChange}
          painting={focusedPainting}
          placeholder={
            mode === 'overview'
              ? referenceImage
                ? t('painting.focus.editPlaceholder')
                : t('painting.board.newRootPlaceholder')
              : annotation.selectedId !== null
                ? t('painting.editor.annotationPlaceholder', { number: annotation.selectedId })
                : referenceImage
                  ? t('painting.focus.editPlaceholder')
                  : undefined
          }
          preparePrompt={(text, images) =>
            annotationKey && images.some((image) => image.fileEntryId === annotationKey)
              ? annotation.preparePrompt(text)
              : text
          }
          status={mode === 'focus' && isGenerating && !isAwaitingNode ? 'generating' : 'idle'}
        />
      </ComposerDock>
      {isInfoOpen && focusedPainting ? (
        <PaintingGenerationInfoSheet
          modelName={modelName}
          onDismiss={() => setIsInfoOpen(false)}
          painting={focusedPainting}
        />
      ) : null}
    </View>
  );
}

/** The model's catalog name, or the raw id's model part when it is no longer configured. */
function paintingModelName(
  modelId: string | null | undefined,
  getModelItem: ReturnType<typeof useModelPickerData>['getModelItem'],
): string | undefined {
  if (!modelId) return undefined;
  const name = isUniqueModelId(modelId) ? getModelItem(modelId)?.model.name : undefined;
  return name ?? modelId.split('::').at(-1);
}

/**
 * Until the user moves, the focus follows the opening painting, then the
 * board's remembered node, then its newest generation.
 */
function defaultBoardFocus(
  board: PaintingBoardData,
  initialFocus: { fileEntryId?: string; paintingId: string } | undefined,
): Focus | null {
  for (const paintingId of [initialFocus?.paintingId, board.board?.focusPaintingId]) {
    if (!paintingId) continue;
    const node = board.nodes.get(paintingNodeId(paintingId));
    if (!node) continue;
    const index = node.images.findIndex((image) => image.fileEntryId === initialFocus?.fileEntryId);
    return { imageIndex: Math.max(0, index), nodeId: node.id };
  }
  const latest = board.paintings.at(-1);
  return latest ? { imageIndex: 0, nodeId: paintingNodeId(latest.id) } : null;
}

function AnnotationChip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={
        selected
          ? 'h-8 justify-center rounded-full bg-foreground px-3.5'
          : 'h-8 justify-center rounded-full bg-card/95 px-3.5 active:opacity-70'
      }
      onPress={onPress}
    >
      <Text
        className={
          selected
            ? 'font-medium text-background text-sm'
            : 'font-medium text-card-foreground text-sm'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Provider diagnostics recorded on the stopped job, for the detail sheet the user opens. */
function stoppedFailure(node: PaintingBoardNode): AiFailureSnapshot | undefined {
  if (node.status.kind !== 'stopped') return undefined;
  const parsed = AiFailureSnapshotSchema.safeParse(node.status.job?.error?.params?.failure);
  return parsed.success ? parsed.data : undefined;
}

function paintingFeedbackContext(node: PaintingBoardNode | undefined): FeedbackContextInput {
  const job = node && node.status.kind !== 'ready' ? node.status.job : undefined;
  const failure = node ? stoppedFailure(node) : undefined;
  const modelId = node?.painting?.modelId;
  return {
    feature: 'paintings',
    executionSource: 'local',
    ...(failure ? feedbackFailureContext({ ...failure, code: job?.error?.code }) : {}),
    paintingId: diagnosticIdentifier(node?.painting?.id),
    jobId: diagnosticIdentifier(job?.id),
    occurredAt: job?.status === 'failed' ? feedbackTimestamp(job.finishedAt) : undefined,
    providerId:
      diagnosticIdentifier(node?.painting?.providerId) ??
      diagnosticIdentifier(failure?.context?.providerId),
    modelId:
      diagnosticIdentifier(failure?.context?.modelId) ??
      diagnosticIdentifier(
        modelId && isUniqueModelId(modelId) ? parseUniqueModelId(modelId).modelId : modelId,
      ),
  };
}

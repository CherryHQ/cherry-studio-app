import {
  getComposerKeyboardStickyOffset,
  ImageGenerationLoader,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ComposerDock,
  ComposerSessionProvider,
  useComposerActions,
  useComposerPresentationActions,
  useComposerPresentationState,
  useComposerSendError,
} from '@/frontend/components/Composer';
import { useModelPickerData } from '@/frontend/components/ModelPicker';
import {
  PaintingInputProvider,
  type PaintingInputSubmission,
  PaintingWorkspaceInput,
  usePaintingInputSession,
} from '@/frontend/components/PaintingInput';
import { useMutation } from '@/frontend/data';
import { paintingJobParamValues } from '@/frontend/data/paintings/usePaintingJobs';
import { useDeletePaintings } from '@/frontend/data/paintings/usePaintings';
import type { PaintingDraftHandoff } from '@/frontend/utils/paintingDraftHandoff';
import { AiFailureSnapshotSchema, type AiFailureSnapshot } from '@/shared/contracts/aiFailure';
import { isUniqueModelId } from '@/shared/data/types/model';
import {
  type ImageParamDraft,
  imageParamsAspectRatio,
  imageParamsResolutionLabel,
  reconcileImageParamDraft,
} from '@/shared/utils/imageGenerationParams';
import { createPaintingGenerationStrategy } from '@/shared/utils/paintingGenerationStrategy';

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
import { paintingResizeOptions } from '../utils/paintingResizeOptions';
import { PaintingBoardOverview } from './PaintingBoardOverview';
import { PaintingErrorMessage } from './PaintingErrorMessage';
import { PaintingFocusCanvas } from './PaintingFocusCanvas';
import { type PaintingResizeChoice, PaintingFocusChrome } from './PaintingFocusChrome';
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
  handoff,
  initialFocus,
  onClose,
  onReceipt,
}: {
  boardId: string | undefined;
  handoff?: PaintingDraftHandoff;
  initialFocus?: { fileEntryId?: string; paintingId: string };
  onClose: () => void;
  onReceipt: (paintingId: string | undefined) => void;
}) {
  return (
    <ComposerSessionProvider
      initialAttachments={handoff?.attachments ?? []}
      initialDraft={handoff?.draft ?? ''}
    >
      {/* The board attaches the focused image itself; a sent image never lingers. */}
      <PaintingInputProvider adoptSubmittedReference={false}>
        <PaintingBoardContent
          initialBoardId={boardId}
          initialFocus={initialFocus}
          initialParamValues={handoff?.paramValues}
          onClose={onClose}
          onReceipt={onReceipt}
        />
      </PaintingInputProvider>
    </ComposerSessionProvider>
  );
}

function PaintingBoardContent({
  initialBoardId,
  initialFocus,
  initialParamValues,
  onClose,
  onReceipt,
}: {
  initialBoardId: string | undefined;
  initialFocus?: { fileEntryId?: string; paintingId: string };
  initialParamValues?: ImageParamDraft;
  onClose: () => void;
  onReceipt: (paintingId: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const generation = usePaintingBoardGeneration(initialBoardId);
  const { boardId } = generation;
  const board = usePaintingBoard(boardId);
  const deletePaintings = useDeletePaintings();
  const reportError = useComposerSendError({ sendFailedLabel: t('painting.input.generateFailed') });
  const { setDraft } = useComposerActions();
  const { dismissInput } = useComposerPresentationActions();
  const { isEditing } = useComposerPresentationState();
  const session = usePaintingInputSession();
  const models = useModelPickerData({ modelType: 'image' });
  const [mode, setMode] = useState<'focus' | 'overview'>('focus');
  const [focus, setFocus] = useState<Focus | null>(null);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const [isChromeHidden, setIsChromeHidden] = useState(false);
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
  const isGenerating = isAwaitingNode || focusedNode?.status.kind === 'generating';

  const referenceImage =
    mode === 'focus' && focusedNode?.status.kind === 'ready' ? (focusedImage ?? null) : null;
  const reference = usePaintingFocusReference(referenceImage);
  const annotationKey = referenceImage?.fileEntryId ?? null;
  const annotation = usePaintingAnnotationDraft(annotationKey);
  const hasAnnotations = annotation.annotations.length > 0;
  const showChrome = !isChromeHidden || isEditing || isGenerating || mode === 'overview';

  // Remember where the user was, so reopening the board lands there.
  const { trigger: updateBoard } = useMutation('PATCH', '/painting-boards/:id');
  const focusedPaintingId = focusedNode?.kind === 'painting' ? focusedNode.paintingId : undefined;
  const rememberedFocus = board.board?.focusPaintingId;
  useEffect(() => {
    if (!boardId || !focusedPaintingId || focusedPaintingId === rememberedFocus) return;
    void updateBoard({
      body: { focusPaintingId: focusedPaintingId },
      params: { id: boardId },
    }).catch(() => undefined);
  }, [boardId, focusedPaintingId, rememberedFocus, updateBoard]);

  const focusNode = useCallback((nodeId: string, nextImageIndex = 0) => {
    setFocus({ imageIndex: nextImageIndex, nodeId });
    setPreviewNodeId(null);
    setMode('focus');
  }, []);

  const handleGenerate = useCallback(
    async (input: PaintingInputSubmission) => {
      const started = await generation.generate(input);
      if (annotationKey && input.attachments.some((item) => item.fileEntryId === annotationKey)) {
        annotation.clearSubmitted(annotationKey);
      }
      setPending({ paintingId: started.paintingId, paramValues: input.paramValues });
      focusNode(paintingNodeId(started.paintingId));
      onReceipt(started.paintingId);
      return started;
    },
    [annotation, annotationKey, focusNode, generation, onReceipt],
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
    refresh: ['/paintings', '/paintings/ids'],
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

  const resizeModel =
    focusedPainting?.modelId && isUniqueModelId(focusedPainting.modelId)
      ? models.getModelItem(focusedPainting.modelId)?.model
      : undefined;
  const resizeMode = createPaintingGenerationStrategy(resizeModel).resolveParameters(1);
  const resizeChoices = referenceImage ? paintingResizeOptions(resizeMode) : [];
  const applyResize = useCallback(
    (choice: PaintingResizeChoice) => {
      // The new ratio applies to the focused image's model; its other drafts stay.
      if (
        resizeModel &&
        resizeMode &&
        focusedPainting?.modelId &&
        isUniqueModelId(focusedPainting.modelId)
      ) {
        const key = JSON.stringify([resizeModel.id, resizeMode.mode]);
        const previous =
          session.parameterDrafts[key]?.values ??
          (session.lastParameterDraft?.modelId === resizeModel.id
            ? session.lastParameterDraft.values
            : {});
        session.selectLocalModel(focusedPainting.modelId);
        session.setParameterDraft(key, {
          modelId: resizeModel.id,
          values: reconcileImageParamDraft({ ...previous, ...choice.paramValues }, resizeMode),
        });
      }
      reference.reattach();
      setDraft((current) =>
        current.trim() ? current : t('painting.focus.resizePrompt', { ratio: choice.ratio }),
      );
    },
    [focusedPainting, reference, resizeMode, resizeModel, session, setDraft, t],
  );

  const retryFocused = useCallback(() => {
    if (!focusedPainting || focusedNode?.status.kind !== 'stopped') return;
    void generation.retry(focusedPainting, focusedNode.status.job).catch(reportError);
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
  const lift = () => {
    'worklet';
    return Math.max(0, -keyboardHeight.get() - keyboardProgress.get() * keyboardOffset);
  };
  const canvasStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboardProgress.get() * (dockHeight.get() + 56) + lift(),
    paddingTop: keyboardProgress.get() * (insets.top + 56),
  }));
  const overlayStyle = useAnimatedStyle(() => ({
    bottom: dockHeight.get() + 10 + lift(),
  }));

  const boardTitle = board.board?.title ?? t('painting.board.newBoard');
  const modelName = resizeModel?.name ?? focusedPainting?.modelId?.split('::').at(-1) ?? undefined;
  const generatingParams =
    (focusedNode?.status.kind === 'generating'
      ? paintingJobParamValues(focusedNode.status.job)
      : undefined) ?? (isAwaitingNode ? pending?.paramValues : undefined);
  const loaderRatio = imageParamsAspectRatio(generatingParams);
  const loaderWidth = Math.min(windowWidth - 32, windowHeight * 0.55 * loaderRatio);

  let canvas;
  if (mode === 'overview' && boardId) {
    canvas = (
      <PaintingBoardOverview
        board={board}
        focusedNodeId={activeFocus?.nodeId ?? null}
        onSelect={focusNode}
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
          onTap={() => (isEditing ? dismissInput() : setIsChromeHidden((hidden) => !hidden))}
          selectedAnnotationId={annotation.selectedId}
          uri={shownImage.uri}
        />
      </Animated.View>
    );
  } else if (isGenerating) {
    canvas = (
      <Pressable className="flex-1 items-center justify-center" onPress={dismissInput}>
        <ImageGenerationLoader
          height={loaderWidth / loaderRatio}
          label={t('painting.status.generating')}
          resolution={imageParamsResolutionLabel(generatingParams)}
          width={loaderWidth}
        />
      </Pressable>
    );
  } else if (focusedNode?.status.kind === 'stopped') {
    const canRetry = retryableJobInput(focusedNode.status.job) !== undefined;
    canvas = (
      <View className="flex-1 justify-center px-6">
        <View className="rounded-3xl bg-card p-4">
          <PaintingErrorMessage
            failure={stoppedFailure(focusedNode)}
            message={focusedNode.status.job?.error?.message}
            onRetry={canRetry ? retryFocused : undefined}
          />
        </View>
      </View>
    );
  } else if (focusedNode) {
    canvas = (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-constant-white/70">
          {t('painting.focus.imageUnavailable')}
        </Text>
      </View>
    );
  } else {
    canvas = (
      <Pressable className="flex-1 items-center justify-center gap-2 px-8" onPress={dismissInput}>
        <Text className="font-semibold text-2xl text-constant-white">
          {t('painting.workspace.emptyTitle')}
        </Text>
        <Text className="text-center text-sm text-constant-white/60">
          {t('painting.workspace.emptyDescription')}
        </Text>
      </Pressable>
    );
  }

  return (
    <View className="flex-1">
      {showChrome ? (
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
            onOpenOverview={boardId ? () => setMode('overview') : undefined}
            onResize={applyResize}
            onShowInfo={focusedPainting ? () => setIsInfoOpen(true) : undefined}
            resizeChoices={resizeChoices}
          />
        )
      ) : null}
      {/* iOS toolbar composition forces the native header visible while mounted. */}
      <Stack.Screen options={{ headerShown: showChrome }} />
      <View className="absolute inset-0">{canvas}</View>
      {showChrome && mode === 'focus' ? (
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
      {showChrome ? (
        <ComposerDock onHeightChange={(height) => dockHeight.set(height)}>
          <PaintingWorkspaceInput
            initialParamValues={initialParamValues}
            onCancel={handleCancel}
            onGenerate={handleGenerate}
            painting={focusedPainting}
            placeholder={
              mode === 'overview'
                ? t('painting.board.newRootPlaceholder')
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
      ) : null}
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
          ? 'h-8 justify-center rounded-full bg-constant-white px-3.5'
          : 'h-8 justify-center rounded-full bg-constant-black/55 px-3.5 active:opacity-70'
      }
      onPress={onPress}
    >
      <Text
        className={
          selected
            ? 'font-medium text-constant-black text-sm'
            : 'font-medium text-constant-white/80 text-sm'
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

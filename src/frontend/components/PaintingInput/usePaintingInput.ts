import { useEffect, useState } from 'react';

import {
  useComposerActions,
  useComposerState,
  type ComposerSendPayload,
} from '@/frontend/components/Composer';
import {
  appendComposerAttachments,
  isComposerAttachmentReady,
  type ComposerAttachmentReady,
} from '@/frontend/components/Composer/utils/composerAttachments';
import { useResolvedFile } from '@/frontend/components/FileEntryPreview';
import { useBackendModule } from '@/frontend/data';
import { FileAttachmentError, type FileAttachmentFact } from '@/shared/contracts/fileAttachment';
import type { Model } from '@/shared/data/types/model';
import {
  type ImageParamDraft,
  isImageParamDraftValid,
  prepareImageParamValues,
  reconcileImageParamDraft,
} from '@/shared/utils/imageGenerationParams';
import {
  createPaintingGenerationStrategy,
  PaintingGenerationError,
} from '@/shared/utils/paintingGenerationStrategy';

import type { PaintingInputSubmission } from './PaintingInput';
import { usePaintingInputSession } from './PaintingInputProvider';

export function usePaintingInput({
  model,
  initialParamValues,
  onGenerate,
}: {
  model: Model | undefined;
  initialParamValues?: ImageParamDraft;
  onGenerate(input: PaintingInputSubmission): Promise<unknown>;
}) {
  const file = useBackendModule('file');
  const { attachments, draft } = useComposerState();
  const { removeAttachment } = useComposerActions();
  const session = usePaintingInputSession();
  const { reference } = session;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const strategy = createPaintingGenerationStrategy(model);
  const selection = reference.selection;
  const resolvedReference = useResolvedFile(selection?.image.fileEntryId);
  const referenceFact = resolvedReference.data
    ? {
        fileEntryId: resolvedReference.data.entry.id,
        mediaType: resolvedReference.data.entry.mediaType,
        name: resolvedReference.data.entry.filename,
        size: resolvedReference.data.entry.size,
      }
    : undefined;
  const isAutomatic = selection?.origin === 'automatic';
  const isReferencePaused = Boolean(
    isAutomatic &&
    (!strategy.acceptsImages ||
      attachments.length > 0 ||
      (!resolvedReference.isLoading && (!referenceFact || !strategy.canReference(referenceFact)))),
  );
  const referenceAttachment: ComposerAttachmentReady | undefined =
    selection && !isReferencePaused
      ? {
          ...selection.image,
          ...referenceFact,
          id: `reference:${selection.image.fileEntryId}`,
          kind: 'image',
          status: 'ready',
          uri: resolvedReference.data?.uri ?? '',
        }
      : undefined;
  const submittedAttachments = referenceAttachment
    ? appendComposerAttachments(attachments, [referenceAttachment])
    : attachments;
  const resolvedMode = strategy.resolveParameters(submittedAttachments.length);
  const parameterKey = JSON.stringify([
    model?.id,
    strategy.resolveMode(submittedAttachments.length),
  ]);
  const storedDraft = session.parameterDrafts[parameterKey];
  const paramValues =
    storedDraft?.values ??
    reconcileImageParamDraft(
      session.lastParameterDraft?.modelId === model?.id
        ? (session.lastParameterDraft?.values ?? {})
        : (initialParamValues ?? {}),
      resolvedMode,
    );
  const { setParameterDraft } = session;
  const modelId = model?.id;
  const mode = resolvedMode?.mode;
  // Retain the committed controls in the longer-lived session, including defaults.
  useEffect(() => {
    if (modelId && mode) setParameterDraft(parameterKey, { modelId, values: paramValues });
  }, [mode, modelId, parameterKey, paramValues, setParameterDraft]);
  const isCheckingReference = Boolean(referenceAttachment && resolvedReference.isLoading);
  const isReferenceUnavailable = Boolean(
    referenceAttachment && !resolvedReference.isLoading && !referenceFact,
  );
  // Model, attachment, and parameter compatibility are submit-time feedback,
  // just like the chat composer. Keep the action available whenever this draft
  // represents an operation; ComposerSurface will restore the draft and report
  // the typed issue if the strategy rejects it.
  const hasSendIntent =
    draft.trim().length > 0 ||
    submittedAttachments.length > 0 ||
    !strategy.requiresPrompt(submittedAttachments.length);
  const canSend = hasSendIntent && !isCheckingReference && !isReferenceUnavailable && !isSubmitting;

  return {
    strategy,
    reference,
    referenceAttachment,
    attachments: submittedAttachments,
    paramValues,
    resolvedMode,
    isSubmitting,
    canSend,
    setParamValue: (key: string, value: unknown) => {
      if (model)
        session.setParameterDraft(parameterKey, {
          modelId: model.id,
          values: { ...paramValues, [key]: value },
        });
    },
    removeAttachment: (id: string) => {
      const attachment = submittedAttachments.find((item) => item.id === id);
      if (attachment?.fileEntryId === selection?.image.fileEntryId) reference.clear();
      removeAttachment(id);
    },
    async send({ attachments: manualAttachments, text }: ComposerSendPayload) {
      if (!model) throw new PaintingGenerationError({ code: 'model-unavailable' });
      if (isReferenceUnavailable || isCheckingReference)
        throw new FileAttachmentError({
          code: 'unavailable',
          fileEntryId: selection?.image.fileEntryId,
        });
      if (!isImageParamDraftValid(paramValues, resolvedMode))
        throw new PaintingGenerationError({ code: 'invalid-parameters' });
      const images = referenceAttachment
        ? appendComposerAttachments(manualAttachments, [referenceAttachment]).filter(
            isComposerAttachmentReady,
          )
        : [...manualAttachments];
      const paramValuesSnapshot = prepareImageParamValues(
        paramValues,
        model.imageGeneration,
        resolvedMode,
      );
      // Pure preflight happens before any asynchronous work and never repairs input.
      strategy.prepare({
        images: images.map(toFileFact),
        prompt: text,
        paramValues: paramValuesSnapshot,
      });
      reference.beginSubmission(images);
      setIsSubmitting(true);
      try {
        const prepared = await file.prepareAttachments({
          fileEntryIds: images.map((image) => image.fileEntryId),
          target: strategy.attachmentTarget,
        });
        const actualImages = prepared.map(({ entry, uri }) => ({
          id: `file:${entry.id}`,
          fileEntryId: entry.id,
          mediaType: entry.mediaType,
          name: entry.filename,
          size: entry.size,
          uri,
          kind: 'image' as const,
          status: 'ready' as const,
        }));
        const request = strategy.prepare({
          images: actualImages.map(toFileFact),
          prompt: text,
          paramValues: paramValuesSnapshot,
        });
        await onGenerate({
          ...request,
          attachments: actualImages,
          modelId: model.id,
          modelName: model.name,
        });
      } catch (error) {
        reference.rejectSubmission();
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
  };
}

function toFileFact(attachment: ComposerAttachmentReady): FileAttachmentFact {
  return {
    fileEntryId: attachment.fileEntryId,
    mediaType: attachment.mediaType,
    name: attachment.name,
    // Legacy draft attachments may omit size. Admission resolves authoritative metadata.
    size: attachment.size ?? 0,
  };
}

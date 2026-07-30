import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import { useCallback, useRef, useState } from 'react';
import {
  discardPreparedFiles,
  imageUriToDataUrl,
  prepareGeneratedImage,
  prepareInternalFileFromUri,
} from '@/data/services/fileStorage';
import { parseUniqueModelId, type UniqueModelId } from '@/data/types/model';
import type { Painting } from '@/data/types/painting';
import type { ChatInputAttachmentDraft } from '@/features/chat/input/utils/chatInputAttachments';
import { useSyncPaintingQueries } from '@/hooks/paintings';
import { useDataServices } from '@/runtime';

export type PaintingGenerationStatus = 'idle' | 'generating' | 'revealing';

export type PaintingOutput = { fileEntryId: string; uri: string };

export type PaintingGenerationInput = {
  attachments: readonly ChatInputAttachmentDraft[];
  mode: ImageGenerationMode;
  modelId: UniqueModelId;
  paramValues: ParamValues;
  prompt: string;
};

export type PaintingGenerationResult = {
  outputs: PaintingOutput[];
  painting: Painting;
};

type IncompleteReceipt = {
  id: string;
  signature: string;
};

export function usePaintingGeneration({
  initialOutputs,
}: {
  initialOutputs: readonly PaintingOutput[];
}) {
  const services = useDataServices();
  const syncPaintingQueries = useSyncPaintingQueries();
  const abortControllerRef = useRef<AbortController | null>(null);
  const incompleteReceiptRef = useRef<IncompleteReceipt | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [outputs, setOutputs] = useState<PaintingOutput[]>(() => [...initialOutputs]);
  const [status, setStatus] = useState<PaintingGenerationStatus>('idle');

  const generate = useCallback(
    async ({
      attachments,
      mode,
      modelId,
      paramValues,
      prompt,
    }: PaintingGenerationInput): Promise<PaintingGenerationResult> => {
      if (abortControllerRef.current) {
        throw new Error('Painting generation is already in progress');
      }

      const imageAttachments = attachments.filter((attachment) => attachment.kind === 'image');
      const signature = generationSignature(prompt, modelId, mode, paramValues, imageAttachments);
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setError(null);
      setStatus('generating');

      try {
        let receiptId =
          incompleteReceiptRef.current?.signature === signature
            ? incompleteReceiptRef.current.id
            : undefined;

        if (!receiptId) {
          const preparedInputs = [];
          try {
            for (const attachment of imageAttachments) {
              if (!attachment.fileEntryId) {
                // react-doctor-disable-next-line async-await-in-loop -- Copy files serially so partial writes can be discarded deterministically.
                preparedInputs.push(
                  await prepareInternalFileFromUri(attachment.uri, attachment.name),
                );
              }
            }
            const { providerId } = parseUniqueModelId(modelId);
            const receipt = await services.painting.create({
              inputFileIds: imageAttachments.flatMap((attachment) =>
                attachment.fileEntryId ? [attachment.fileEntryId] : [],
              ),
              modelId,
              preparedInputFiles: preparedInputs,
              prompt: prompt.trim(),
              providerId,
            });
            receiptId = receipt.id;
          } catch (receiptError) {
            discardPreparedFiles(preparedInputs);
            throw receiptError;
          }
          incompleteReceiptRef.current = { id: receiptId, signature };
        }

        const inputImages = await Promise.all(
          imageAttachments.map((attachment) =>
            imageUriToDataUrl(attachment.uri, attachment.mediaType),
          ),
        );
        const result = await services.ai.generateImage({
          inputImages,
          mode,
          paramValues,
          prompt: prompt.trim(),
          requestOptions: { signal: controller.signal },
          uniqueModelId: modelId,
        });
        if (result.images.length === 0) {
          throw new Error('Image provider returned no image');
        }

        const preparedOutputs: ReturnType<typeof prepareGeneratedImage>[] = [];
        try {
          for (const image of result.images) {
            preparedOutputs.push(prepareGeneratedImage(image.base64, image.mediaType));
          }
        } catch (prepareError) {
          discardPreparedFiles(preparedOutputs);
          throw prepareError;
        }
        const painting = await services.painting.replaceOutputs(receiptId, preparedOutputs);
        const persistedOutputIds = new Set(painting.files.output);
        const generatedOutputs = preparedOutputs.map((preparedOutput) => {
          if (!persistedOutputIds.has(preparedOutput.id)) {
            throw new Error('Generated painting has a missing output file');
          }
          return { fileEntryId: preparedOutput.id, uri: preparedOutput.uri };
        });
        incompleteReceiptRef.current = null;
        setOutputs(generatedOutputs);
        setStatus('revealing');
        await syncPaintingQueries(painting);
        return { outputs: generatedOutputs, painting };
      } catch (generationError) {
        const normalized =
          generationError instanceof Error ? generationError : new Error(String(generationError));
        setError(normalized);
        setStatus('idle');
        throw normalized;
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    },
    [services.ai, services.painting, syncPaintingQueries],
  );

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort(new Error('Painting generation cancelled'));
  }, []);
  const finishReveal = useCallback(() => setStatus('idle'), []);

  return {
    cancel,
    error,
    finishReveal,
    generate,
    outputs,
    status,
  };
}

function generationSignature(
  prompt: string,
  modelId: UniqueModelId,
  mode: ImageGenerationMode,
  paramValues: ParamValues,
  attachments: readonly ChatInputAttachmentDraft[],
): string {
  return JSON.stringify({
    attachments: attachments.map(
      (attachment) => attachment.fileEntryId ?? `${attachment.id}:${attachment.uri}`,
    ),
    mode,
    modelId,
    paramValues: sortRecord(paramValues),
    prompt: prompt.trim(),
  });
}

function sortRecord(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  );
}

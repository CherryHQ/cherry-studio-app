import { useCallback, useRef, useState } from 'react';

import { useDataServices } from '@/data/runtime';
import {
  discardPreparedFiles,
  imageUriToDataUrl,
  prepareGeneratedImage,
  prepareInternalFileFromUri,
} from '@/data/services/fileStorage';
import { parseUniqueModelId, type UniqueModelId } from '@/data/types/model';
import type { Painting } from '@/data/types/painting';
import { usePaintingQueryInvalidation } from '@/hooks/paintings';
import type { ChatInputAttachmentDraft } from '@/screens/ChatScreen/input/utils/chatInputAttachments';

export type PaintingGenerationStatus = 'idle' | 'generating' | 'revealing';

export type PaintingOutput = { fileEntryId: string; uri: string };

export type PaintingGenerationInput = {
  attachments: readonly ChatInputAttachmentDraft[];
  modelId: UniqueModelId;
  prompt: string;
};

export type PaintingGenerationResult = {
  output: PaintingOutput;
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
  const invalidatePaintings = usePaintingQueryInvalidation();
  const abortControllerRef = useRef<AbortController | null>(null);
  const incompleteReceiptRef = useRef<IncompleteReceipt | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [outputs, setOutputs] = useState<PaintingOutput[]>(() => [...initialOutputs]);
  const [status, setStatus] = useState<PaintingGenerationStatus>('idle');

  const generate = useCallback(
    async ({
      attachments,
      modelId,
      prompt,
    }: PaintingGenerationInput): Promise<PaintingGenerationResult> => {
      if (abortControllerRef.current) {
        throw new Error('Painting generation is already in progress');
      }

      const imageAttachments = attachments.filter((attachment) => attachment.kind === 'image');
      const signature = generationSignature(prompt, modelId, imageAttachments);
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
          prompt: prompt.trim(),
          requestOptions: { signal: controller.signal },
          uniqueModelId: modelId,
        });
        const image = result.images[0];
        if (!image) {
          throw new Error('Image provider returned no image');
        }

        const preparedOutput = prepareGeneratedImage(image.base64, image.mediaType);
        const painting = await services.painting.replaceOutputs(receiptId, [preparedOutput]);
        const fileEntryId = painting.files.output[0];
        if (!fileEntryId) {
          throw new Error('Generated painting has no output file');
        }
        const output = { fileEntryId, uri: preparedOutput.uri };
        incompleteReceiptRef.current = null;
        setOutputs([output]);
        setStatus('revealing');
        await invalidatePaintings(painting.id);
        return { output, painting };
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
    [invalidatePaintings, services.ai, services.painting],
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
  attachments: readonly ChatInputAttachmentDraft[],
): string {
  return JSON.stringify({
    attachments: attachments.map(
      (attachment) => attachment.fileEntryId ?? `${attachment.id}:${attachment.uri}`,
    ),
    modelId,
    prompt: prompt.trim(),
  });
}

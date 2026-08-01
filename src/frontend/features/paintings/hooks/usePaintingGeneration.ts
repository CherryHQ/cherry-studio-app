import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBackendModule } from '@/frontend/data';
import type { ChatInputAttachmentDraft } from '@/frontend/features/chat/input/utils/chatInputAttachments';
import type {
  PaintingGenerationResult as BackendPaintingGenerationResult,
  PaintingGenerationOutput,
} from '@/shared/contracts';
import type { UniqueModelId } from '@/shared/data/types/model';

import { useSyncPaintingQueries } from './usePaintings';

export type PaintingGenerationStatus = 'idle' | 'generating' | 'revealing';

export type PaintingOutput = PaintingGenerationOutput;

export type PaintingGenerationInput = {
  attachments: readonly ChatInputAttachmentDraft[];
  mode: ImageGenerationMode;
  modelId: UniqueModelId;
  paramValues: ParamValues;
  prompt: string;
};

export type PaintingGenerationResult = BackendPaintingGenerationResult;

export function usePaintingGeneration({
  initialOutputs,
}: {
  initialOutputs: readonly PaintingOutput[];
}) {
  const paintings = useBackendModule('paintings');
  const syncPaintingQueries = useSyncPaintingQueries();
  const [session] = useState(() => paintings.createGenerationSession());
  const abortControllerRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [outputs, setOutputs] = useState<PaintingOutput[]>(() => [...initialOutputs]);
  const [status, setStatus] = useState<PaintingGenerationStatus>('idle');

  useEffect(() => () => session.dispose(), [session]);

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

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setError(null);
      setStatus('generating');

      try {
        const result = await session.generate(
          {
            images: attachments.flatMap((attachment) =>
              attachment.kind === 'image'
                ? [
                    {
                      fileEntryId: attachment.fileEntryId,
                      id: attachment.id,
                      mediaType: attachment.mediaType,
                      name: attachment.name,
                      uri: attachment.uri,
                    },
                  ]
                : [],
            ),
            mode,
            modelId,
            paramValues,
            prompt,
          },
          controller.signal,
        );
        setOutputs(result.outputs);
        setStatus('revealing');
        await syncPaintingQueries(result.painting);
        return result;
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
    [session, syncPaintingQueries],
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

import type { ImageGenerationMode, ParamValues } from '@cherrystudio/provider-registry';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';
import { useCallback, useEffect, useState } from 'react';

import type { ComposerAttachmentDraft } from '@/frontend/components/composer/utils/composerAttachments';
import { useBackendModule } from '@/frontend/data';
import type {
  PaintingGenerationResult as BackendPaintingGenerationResult,
  PaintingGenerationOutput,
} from '@/shared/contracts';

import { useSyncPaintingQueries } from './usePaintings';

export type PaintingGenerationStatus = 'idle' | 'generating' | 'revealing';

export type PaintingOutput = PaintingGenerationOutput;

export type PaintingGenerationInput = {
  attachments: readonly ComposerAttachmentDraft[];
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
      setError(null);
      setStatus('generating');

      try {
        const result = await session.generate({
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
        });
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
      }
    },
    [session, syncPaintingQueries],
  );

  const cancel = useCallback(() => session.cancel(), [session]);
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

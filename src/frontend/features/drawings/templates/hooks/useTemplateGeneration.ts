import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useModelPickerData } from '@/frontend/components/ModelPicker';
import {
  type PaintingInputSubmission,
  usePaintingInput,
  usePaintingInputSession,
} from '@/frontend/components/PaintingInput';
import { paintingGenerationInput } from '@/frontend/components/PaintingInput/paintingGenerationInput';
import { usePreference } from '@/frontend/data/hooks';
import { useStartPaintingGeneration } from '@/frontend/data/paintings/usePaintings';
import { isUniqueModelId } from '@/shared/data/types/model';

import type { PaintingTemplate } from '../../utils/paintingTemplates';

/**
 * Sends a filled template through the painting composer's own submission path,
 * so model, reference, and parameter checks match the board exactly. The new
 * board is titled after the template, and the stage gives way to it.
 */
export function useTemplateGeneration(template: PaintingTemplate) {
  const router = useRouter();
  const [defaultModelId] = usePreference('feature.paintings.default_model_id');
  const { localModelId, selectLocalModel } = usePaintingInputSession();
  const selectedModelId = localModelId ?? (isUniqueModelId(defaultModelId) ? defaultModelId : null);
  const modelItem = useModelPickerData({ modelType: 'image' }).getModelItem(selectedModelId);
  const startGeneration = useStartPaintingGeneration();
  const handleGenerate = useCallback(
    async (input: PaintingInputSubmission) => {
      const started = await startGeneration(paintingGenerationInput(input));
      router.dismiss();
      router.push({ params: { paintingId: started.paintingId }, pathname: '/paintings' });
    },
    [router, startGeneration],
  );
  const preparePrompt = useCallback(
    (text: string) => ({ displayPrompt: template.title, prompt: text }),
    [template.title],
  );
  const input = usePaintingInput({
    model: modelItem?.model,
    onGenerate: handleGenerate,
    preparePrompt,
  });

  return { input, modelItem, selectedModelId, selectModel: selectLocalModel };
}

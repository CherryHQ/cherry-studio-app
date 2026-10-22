// Logic-only and deep-importable: hooks and their tests use it without loading the composer UI.
import type { PaintingGenerationInput } from '@/shared/contracts';

import type { PaintingInputSubmission } from './PaintingInput';

/** The generation request a submission makes: on `boardId`, or on a new board when omitted. */
export function paintingGenerationInput(
  input: PaintingInputSubmission,
  boardId?: string,
): PaintingGenerationInput {
  return {
    ...(boardId ? { boardId } : {}),
    ...(input.displayPrompt ? { brief: input.displayPrompt } : {}),
    fileEntryIds: input.attachments.map((attachment) => attachment.fileEntryId),
    mode: input.mode,
    modelId: input.modelId,
    modelName: input.modelName,
    paramValues: input.paramValues,
    prompt: input.prompt,
  };
}

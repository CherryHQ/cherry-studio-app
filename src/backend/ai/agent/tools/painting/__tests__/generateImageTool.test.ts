import { FileEntrySchema } from '@/shared/data/types/file';
import { createUniqueModelId } from '@/shared/data/types/model';

import type { TurnFileScope } from '../../../resources/managedFileResolver';
import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../../../runtime';
import type { ConfiguredPaintingModel, PaintingToolDependencies } from '../generateImage';
import { createGenerateImageTool } from '../generateImageTool';

const ENTRY = FileEntrySchema.parse({
  createdAt: 1_756_166_400_000,
  filename: 'image.png',
  id: '00000000-0000-7000-8000-000000000001',
  mediaType: 'image/png',
  provenance: 'generated',
  size: 12,
  updatedAt: 1_756_166_400_000,
});

const MODEL: ConfiguredPaintingModel = {
  support: null,
  uniqueModelId: createUniqueModelId('openai', 'gpt-image-1'),
};
const EDIT_MODEL: ConfiguredPaintingModel = {
  support: { modes: { edit: { supports: {} } } },
  uniqueModelId: MODEL.uniqueModelId,
};

const TURN_FILES: TurnFileScope = { fileEntryIds: new Set([ENTRY.id]) };

describe('createGenerateImageTool', () => {
  test('imports generated images before reporting them as artifacts', async () => {
    const deps = createDependencies();
    const tool = createGenerateImageTool(deps, MODEL, TURN_FILES);

    const result = await execute(tool, { prompt: 'A cherry orchard at dawn' });

    expect(deps.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'generate', prompt: 'A cherry orchard at dawn' }),
    );
    // The model gets refs, never bytes.
    expect(result.value).toEqual([{ id: ENTRY.id, name: 'image.png' }]);
    expect(result.artifacts).toEqual([
      {
        ref: { kind: 'managed-file', fileEntryId: ENTRY.id },
        mediaType: 'image/png',
        name: 'image.png',
        kind: 'created',
      },
    ]);
  });

  test('tells the model to stop when no drawing model is configured', async () => {
    const deps = createDependencies();
    const tool = createGenerateImageTool(deps, null, TURN_FILES);

    const result = await execute(tool, { prompt: 'A cherry orchard at dawn' });

    expect(deps.ai.generateImage).not.toHaveBeenCalled();
    expect(String((result.value as { message: string }).message)).toContain('Settings > Model');
    expect(result.artifacts).toEqual([]);
  });

  test('reports a provider failure without leaving the library untouched', async () => {
    const deps = createDependencies({
      generateImage: async () => {
        throw new Error('provider exploded');
      },
    });
    const tool = createGenerateImageTool(deps, MODEL, TURN_FILES);

    const result = await execute(tool, { prompt: 'A cherry orchard at dawn' });

    expect(result.value).toMatchObject({ status: 'error' });
    expect(deps.files.createInternalEntry).not.toHaveBeenCalled();
  });

  test('discards the entries it already imported when a later import fails', async () => {
    const deps = createDependencies({
      generateImage: async () =>
        ({
          images: [
            { base64: 'AAAA', mediaType: 'image/png' },
            { base64: 'BBBB', mediaType: 'image/png' },
          ],
        }) as never,
    });
    deps.files.createInternalEntry
      .mockResolvedValueOnce(ENTRY)
      .mockRejectedValueOnce(new Error('disk full'));
    const tool = createGenerateImageTool(deps, MODEL, TURN_FILES);

    const result = await execute(tool, { prompt: 'A cherry orchard at dawn' });

    expect(result.value).toMatchObject({ status: 'error' });
    // A partial generation must not leave orphan rows in the file library.
    expect(deps.files.discard).toHaveBeenCalledWith([ENTRY]);
  });

  test('rejects an empty prompt without calling the provider', async () => {
    const deps = createDependencies();
    const tool = createGenerateImageTool(deps, MODEL, TURN_FILES);

    const result = await execute(tool, { prompt: '   ' });

    expect(deps.ai.generateImage).not.toHaveBeenCalled();
    expect(result.value).toMatchObject({ status: 'error', retryable: true });
  });

  test('rejects an image id outside the turn before reading the file', async () => {
    const deps = createDependencies();
    const tool = createGenerateImageTool(deps, EDIT_MODEL, { fileEntryIds: new Set() });

    const result = await execute(tool, {
      image_ids: [ENTRY.id],
      prompt: 'Turn this into a watercolor.',
    });

    expect(result.value).toMatchObject({
      status: 'error',
      message: expect.stringContaining('not part of this conversation'),
    });
    expect(deps.files.resolve).not.toHaveBeenCalled();
    expect(deps.ai.generateImage).not.toHaveBeenCalled();
  });

  test('carries the stable built-in ref and asks before spending provider quota', () => {
    const tool = createGenerateImageTool(createDependencies(), MODEL, TURN_FILES);

    expect(tool.ref).toEqual({ source: 'builtin', capabilityId: 'generate_image' });
    expect(tool.approval).toBe('ask');
  });
});

function createDependencies(overrides: { generateImage?: () => Promise<never> } = {}) {
  return {
    ai: {
      generateImage: jest.fn(
        overrides.generateImage ??
          (async () => ({ images: [{ base64: 'AAAA', mediaType: 'image/png' }] })),
      ),
    },
    files: {
      createInternalEntry: jest.fn(async () => ENTRY),
      discard: jest.fn(async () => undefined),
      readDataUrl: jest.fn(async () => 'data:image/png;base64,AAAA'),
      resolve: jest.fn(async () => null),
    },
    preference: { get: jest.fn(async () => null) },
    providerRegistry: { getImageGenerationSupport: jest.fn(() => null) },
  } as unknown as PaintingToolDependencies & {
    ai: { generateImage: jest.Mock };
    files: { createInternalEntry: jest.Mock; discard: jest.Mock };
  };
}

function execute(tool: RuntimeTool, input: RuntimeJsonValue): Promise<RuntimeToolResult> {
  return tool.execute({ input, signal: new AbortController().signal, toolCallId: 'call-1' });
}

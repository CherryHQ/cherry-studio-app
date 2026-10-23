import type { GenerateImageOutput } from '@cherrystudio/universal/ai/builtinTools';

import type { AiUsageAttribution } from '@/backend/ai/AiService';
import { FileEntrySchema } from '@/shared/data/types/file';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import type { TurnFileScope } from '../../../resources/managedFileResolver';
import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../../../runtime';
import {
  resolveConfiguredPaintingModel,
  type ConfiguredPaintingModel,
  type PaintingToolDependencies,
} from '../generateImage';
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
  test('resolves editing support from the configured model, including copied provider metadata', async () => {
    const uniqueModelId = createUniqueModelId('copied-aihubmix', 'ernie-irag-edit');
    const getById = jest.fn(async () => ({ imageGeneration: EDIT_MODEL.support }) as Model | null);
    const dependencies = {
      models: { getById },
      preference: {
        get: jest.fn(async () => uniqueModelId),
      } as unknown as PaintingToolDependencies['preference'],
    };
    await expect(resolveConfiguredPaintingModel(dependencies)).resolves.toEqual({
      uniqueModelId,
      support: EDIT_MODEL.support,
    });
    expect(getById).toHaveBeenCalledWith(uniqueModelId);
    getById.mockResolvedValueOnce(null);
    await expect(resolveConfiguredPaintingModel(dependencies)).resolves.toBeNull();
  });

  test('imports generated images before reporting them as artifacts', async () => {
    const deps = createDependencies();
    const tool = createGenerateImageTool(deps, MODEL, TURN_FILES);

    const result = await execute(tool, { prompt: 'A cherry orchard at dawn' });

    expect(deps.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'generate', prompt: 'A cherry orchard at dawn' }),
    );
    // The library entry is named after the prompt, not an id.
    expect(deps.files.createInternalEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'A cherry orchard at dawn.png', source: 'base64' }),
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

  test('edits an uploaded image and reuses its generated result by id in a later call', async () => {
    const uploaded = FileEntrySchema.parse({
      ...ENTRY,
      id: '00000000-0000-7000-8000-000000000002',
      provenance: 'imported',
    });
    const deps = createDependencies();
    jest
      .mocked(deps.files.resolve)
      .mockResolvedValue({ entry: uploaded, uri: 'file:///uploaded.png' });
    jest.mocked(deps.files.readDataUrl).mockResolvedValue('data:image/png;base64,VVBMT0FE');
    const firstTool = createGenerateImageTool(deps, EDIT_MODEL, {
      fileEntryIds: new Set([uploaded.id]),
    });

    const first = await execute(firstTool, {
      image_ids: [uploaded.id],
      prompt: 'Keep the subject and change the style to watercolor.',
    });

    expect(deps.ai.generateImage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        mode: 'edit',
        inputImages: ['data:image/png;base64,VVBMT0FE'],
        prompt: 'Keep the subject and change the style to watercolor.',
        uniqueModelId: EDIT_MODEL.uniqueModelId,
      }),
    );
    expect(first.value).toEqual([{ id: ENTRY.id, name: ENTRY.filename }]);
    const [generated] = first.value as GenerateImageOutput;
    const edited = FileEntrySchema.parse({
      ...ENTRY,
      id: '00000000-0000-7000-8000-000000000003',
    });
    jest
      .mocked(deps.files.resolve)
      .mockResolvedValue({ entry: ENTRY, uri: 'file:///generated.png' });
    jest.mocked(deps.files.readDataUrl).mockResolvedValue('data:image/png;base64,R0VORVJBVEVE');
    deps.files.createInternalEntry.mockResolvedValue(edited);
    const nextTool = createGenerateImageTool(deps, EDIT_MODEL, {
      fileEntryIds: new Set(first.artifacts.map((artifact) => artifact.ref.fileEntryId)),
    });

    const next = await execute(nextTool, {
      image_ids: [generated.id],
      prompt: 'Keep this image and make the background blue.',
    });

    expect(deps.ai.generateImage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        mode: 'edit',
        inputImages: ['data:image/png;base64,R0VORVJBVEVE'],
        prompt: 'Keep this image and make the background blue.',
        uniqueModelId: EDIT_MODEL.uniqueModelId,
      }),
    );
    expect(deps.files.resolve).toHaveBeenLastCalledWith(generated.id);
    expect(next.value).toEqual([{ id: edited.id, name: edited.filename }]);
    expect(next.artifacts).toMatchObject([{ ref: { fileEntryId: edited.id } }]);
  });

  test.each<{
    name: string;
    support: ConfiguredPaintingModel['support'];
    operations: string;
    reference: 'optional' | 'required' | 'unavailable';
  }>([
    {
      name: 'generation and editing',
      support: { modes: { generate: { supports: {} }, edit: { supports: {} } } },
      operations: 'generate, edit',
      reference: 'optional',
    },
    {
      name: 'editing only',
      support: EDIT_MODEL.support,
      operations: 'edit',
      reference: 'required',
    },
    {
      name: 'generation only',
      support: { modes: { generate: { supports: {} } } },
      operations: 'generate',
      reference: 'unavailable',
    },
    {
      name: 'missing capability metadata',
      support: null,
      operations: 'generate',
      reference: 'unavailable',
    },
    {
      name: 'no supported tool modes',
      support: { modes: {} },
      operations: 'none',
      reference: 'unavailable',
    },
  ])(
    'advertises the same operations and reference requirements as its schema: $name',
    ({ support, operations, reference }) => {
      const tool = createGenerateImageTool(createDependencies(), { ...MODEL, support }, TURN_FILES);

      expect(tool.description).toContain(`Available operations: ${operations}.`);
      if (reference === 'unavailable') {
        expect(tool.inputSchema).not.toHaveProperty('properties.image_ids');
        expect(tool.description).toContain('Reference-image editing is unavailable');
      } else {
        expect(tool.inputSchema).toMatchObject({
          properties: { image_ids: { type: 'array', minItems: 1, maxItems: 1 } },
        });
        expect(tool.description).toContain('user-uploaded image or an earlier generated image');
      }
      if (reference === 'required') {
        expect(tool.inputSchema).toMatchObject({ required: expect.arrayContaining(['image_ids']) });
        expect(tool.description).toContain('image_ids is required for every call');
        expect(tool.inputSchema).toHaveProperty(
          'properties.image_ids.description',
          expect.not.stringContaining('omit'),
        );
      } else {
        expect(tool.inputSchema).not.toMatchObject({
          required: expect.arrayContaining(['image_ids']),
        });
      }
    },
  );

  test('reads the reserved Agent message at execution rather than tool creation', async () => {
    const deps = createDependencies();
    const usageAttribution: AiUsageAttribution = {
      source: { type: 'agent', id: 'agent-1', name: 'Agent One', icon: null },
      messageRef: null,
    };
    const resolveUsageAttribution = jest.fn(() => ({ ...usageAttribution }));
    const tool = createGenerateImageTool(deps, MODEL, TURN_FILES, resolveUsageAttribution);
    expect(resolveUsageAttribution).not.toHaveBeenCalled();

    usageAttribution.messageRef = { kind: 'agent-session', id: 'message-1' };
    await execute(tool, { prompt: 'A cherry' });
    expect(deps.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ usageAttribution }),
    );
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

  test('reports an unavailable reference without falling back to text-only generation', async () => {
    const deps = createDependencies();
    const tool = createGenerateImageTool(deps, EDIT_MODEL, TURN_FILES);

    const result = await execute(tool, {
      image_ids: [ENTRY.id],
      prompt: 'Make the background blue.',
    });

    expect(result.value).toMatchObject({
      status: 'error',
      message: expect.stringContaining('attach it again'),
    });
    expect(result.artifacts).toEqual([]);
    expect(deps.files.readDataUrl).not.toHaveBeenCalled();
    expect(deps.ai.generateImage).not.toHaveBeenCalled();
    expect(deps.files.createInternalEntry).not.toHaveBeenCalled();
  });

  test('publishes a parameter shared by generate and edit with a concrete type', () => {
    const quality = { type: 'enum' as const, options: ['low', 'high'] };
    const tool = createGenerateImageTool(
      createDependencies(),
      {
        support: {
          modes: { generate: { supports: { quality } }, edit: { supports: { quality } } },
        },
        uniqueModelId: MODEL.uniqueModelId,
      },
      TURN_FILES,
    );

    expect(tool.inputSchema).toMatchObject({
      properties: { quality: { type: 'string', enum: ['low', 'high'] } },
    });
    expect(JSON.stringify(tool.inputSchema)).not.toContain('anyOf');
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
    models: { getById: jest.fn(async () => null) },
  } as unknown as PaintingToolDependencies & {
    ai: { generateImage: jest.Mock };
    files: { createInternalEntry: jest.Mock; discard: jest.Mock };
  };
}

function execute(tool: RuntimeTool, input: RuntimeJsonValue): Promise<RuntimeToolResult> {
  return tool.execute({
    input,
    signal: new AbortController().signal,
    toolCallId: 'call-1',
    turnId: 'turn-1',
  });
}

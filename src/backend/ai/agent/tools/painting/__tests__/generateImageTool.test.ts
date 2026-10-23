import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { AiUsageAttribution } from '@/backend/ai/AiService';
import { AiRequestError } from '@/shared/contracts/aiFailure';
import { FileEntrySchema } from '@/shared/data/types/file';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import { createAiFailure } from '@/shared/utils/createAiFailure';
import { MAX_IMAGE_ATTACHMENT_BYTES } from '@/shared/utils/fileAttachmentPolicy';

import { toolResultDiagnostics } from '../../../host/toolResultDiagnostics';
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

const MODEL = configuredModel();
const EDIT_MODEL = configuredModel({ imageGeneration: { modes: { edit: { supports: {} } } } });

const TURN_FILES: TurnFileScope = { fileEntryIds: new Set([ENTRY.id]) };

describe('createGenerateImageTool', () => {
  test('resolves editing support from the configured model, including copied provider metadata', async () => {
    const uniqueModelId = createUniqueModelId('copied-aihubmix', 'ernie-irag-edit');
    const model = { ...EDIT_MODEL.model, id: uniqueModelId };
    const getById = jest.fn(async () => model as Model | null);
    const dependencies = {
      models: { getById },
      preference: {
        get: jest.fn(async () => uniqueModelId),
      } as unknown as PaintingToolDependencies['preference'],
    };
    await expect(resolveConfiguredPaintingModel(dependencies)).resolves.toEqual({
      uniqueModelId,
      model,
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

  test('edits an uploaded image by its attachment id', async () => {
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
    const tool = createGenerateImageTool(deps, EDIT_MODEL, {
      fileEntryIds: new Set([uploaded.id]),
    });

    const result = await execute(tool, {
      image_ids: [uploaded.id],
      prompt: 'Keep the subject and change the style to watercolor.',
    });

    expect(deps.files.resolve).toHaveBeenCalledWith(uploaded.id);
    expect(deps.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'edit',
        inputImages: ['data:image/png;base64,VVBMT0FE'],
        prompt: 'Keep the subject and change the style to watercolor.',
        uniqueModelId: EDIT_MODEL.uniqueModelId,
      }),
    );
    expect(result.value).toEqual([{ id: ENTRY.id, name: ENTRY.filename }]);
  });

  test.each<{ name: string; model: Partial<Model>; mode: 'generate' | 'edit' }>([
    {
      name: 'reference-capable generation endpoint',
      model: {
        imageGeneration: { modes: { generate: { supports: {}, maxInputImages: 2 } } },
      },
      mode: 'generate',
    },
    {
      name: 'image input modality without registry capability metadata',
      model: {
        endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
        inputModalities: ['text', 'image'],
      },
      mode: 'edit',
    },
  ])(
    'uses the shared reference route for $name while retaining the one-image limit',
    async ({ model, mode }) => {
      const deps = createDependencies();
      jest.mocked(deps.files.resolve).mockResolvedValue({ entry: ENTRY, uri: 'file:///image.png' });
      const tool = createGenerateImageTool(deps, configuredModel(model), TURN_FILES);

      expect(tool.inputSchema).toMatchObject({
        properties: { image_ids: { maxItems: 1 } },
      });
      expect(tool.description).toContain('user-uploaded image or an earlier generated image');
      const result = await execute(tool, { image_ids: [ENTRY.id], prompt: 'Make it blue.' });
      expect(result.failure).toBeUndefined();
      expect(deps.ai.generateImage).toHaveBeenCalledWith(
        expect.objectContaining({ mode, inputImages: ['data:image/png;base64,AAAA'] }),
      );

      deps.ai.generateImage.mockClear();
      const rejected = await execute(tool, { image_ids: [ENTRY.id, ENTRY.id], prompt: 'Combine.' });
      expect(rejected.failure?.error.code).toBe('invalid_image_request');
      expect(deps.ai.generateImage).not.toHaveBeenCalled();
    },
  );

  test('keeps the admitted model capability snapshot after the stored model changes', async () => {
    const source = configuredModel({
      imageGeneration: { modes: { generate: { supports: {}, maxInputImages: 1 } } },
    });
    const deps = createDependencies();
    jest.mocked(deps.models.getById).mockResolvedValue(source.model);
    jest.mocked(deps.preference.get).mockResolvedValue(source.uniqueModelId);
    jest.mocked(deps.files.resolve).mockResolvedValue({ entry: ENTRY, uri: 'file:///image.png' });
    const captured = await resolveConfiguredPaintingModel(deps);
    source.model.imageGeneration!.modes.generate!.maxInputImages = 0;
    source.model.isEnabled = false;
    jest.mocked(deps.models.getById).mockClear();
    jest.mocked(deps.preference.get).mockClear();
    const tool = createGenerateImageTool(deps, captured, TURN_FILES);

    const result = await execute(tool, { image_ids: [ENTRY.id], prompt: 'Make it blue.' });
    expect(result.failure).toBeUndefined();
    expect(deps.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'generate' }),
    );
    expect(deps.models.getById).not.toHaveBeenCalled();
    expect(deps.preference.get).not.toHaveBeenCalled();
  });

  test('accepts an empty prompt only when the selected reference operation permits it', async () => {
    const deps = createDependencies();
    jest.mocked(deps.files.resolve).mockResolvedValue({ entry: ENTRY, uri: 'file:///image.png' });
    const tool = createGenerateImageTool(
      deps,
      configuredModel({
        imageGeneration: {
          modes: { generate: { supports: {} }, edit: { supports: {}, requirePrompt: false } },
        },
      }),
      TURN_FILES,
    );
    expect((await execute(tool, { image_ids: [ENTRY.id], prompt: '' })).failure).toBeUndefined();
    expect(deps.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'edit', prompt: '' }),
    );
    deps.ai.generateImage.mockClear();
    expect((await execute(tool, { prompt: '' })).failure?.error.code).toBe('invalid_image_request');
    expect(deps.ai.generateImage).not.toHaveBeenCalled();
  });

  test.each([{ isEnabled: false }, { isHidden: true }])(
    'rejects an unavailable model before spending provider quota: %j',
    async (model) => {
      const deps = createDependencies();
      const tool = createGenerateImageTool(deps, configuredModel(model), TURN_FILES);
      const result = await execute(tool, { prompt: 'A cherry.' });
      expect(result.failure?.error.code).toBe('invalid_image_request');
      expect(deps.ai.generateImage).not.toHaveBeenCalled();
    },
  );

  test('rejects a parameter from another operation instead of silently dropping it', async () => {
    const deps = createDependencies();
    jest.mocked(deps.files.resolve).mockResolvedValue({ entry: ENTRY, uri: 'file:///image.png' });
    const tool = createGenerateImageTool(
      deps,
      configuredModel({
        imageGeneration: {
          modes: {
            generate: { supports: { quality: { type: 'enum', options: ['high', 'low'] } } },
            edit: { supports: {} },
          },
        },
      }),
      TURN_FILES,
    );
    const result = await execute(tool, { image_ids: [ENTRY.id], prompt: 'Blue.', quality: 'high' });
    expect(result.failure?.error.code).toBe('invalid_image_request');
    expect(deps.files.readDataUrl).not.toHaveBeenCalled();
    expect(deps.ai.generateImage).not.toHaveBeenCalled();
  });

  test('adapts tool custom-size input to the shared canonical parameter request', async () => {
    const deps = createDependencies();
    const tool = createGenerateImageTool(
      deps,
      configuredModel({
        imageGeneration: {
          modes: {
            generate: {
              supports: {
                size: { type: 'enum', options: ['auto', 'custom'] },
                customSize: { type: 'size', pairedEnumKey: 'size', minSide: 512, maxSide: 2048 },
              },
            },
          },
        },
      }),
      TURN_FILES,
    );
    const result = await execute(tool, { prompt: 'A cherry.', customSize: '1024X1536' });
    expect(result.failure).toBeUndefined();
    expect(deps.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ paramValues: { size: '1024x1536' } }),
    );
  });

  test.each<{
    name: string;
    support: Model['imageGeneration'];
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
      support: EDIT_MODEL.model.imageGeneration,
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
      support: undefined,
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
      const tool = createGenerateImageTool(
        createDependencies(),
        configuredModel({ imageGeneration: support }),
        TURN_FILES,
      );

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
          expect.not.stringContaining('Omit'),
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
    expect(result.failure?.error.message).toContain('Settings > Model');
    expect(result.artifacts).toEqual([]);
    expect(deps.preference.get).not.toHaveBeenCalled();
  });

  test('reports a provider failure without leaving the library untouched', async () => {
    const deps = createDependencies({
      generateImage: async () => {
        throw new Error('provider exploded');
      },
    });
    const tool = createGenerateImageTool(deps, MODEL, TURN_FILES);

    const result = await execute(tool, { prompt: 'A cherry orchard at dawn' });

    expect(result.failure).toMatchObject({
      scope: 'call',
      error: { code: 'image_generation_failed', retryable: false },
    });
    expect(deps.files.createInternalEntry).not.toHaveBeenCalled();
  });

  test.each([
    { statusCode: 403, retryable: false },
    { statusCode: 503, retryable: true },
  ])(
    'preserves request failure facts for both runtime and diagnostics: %j',
    async ({ statusCode, retryable }) => {
      const requestError = new AiRequestError(
        createAiFailure({
          code: 'image_provider_error',
          message: 'The provider rejected this image request.',
          retryable,
          origin: 'provider',
          name: 'APIError',
          context: { statusCode, providerId: 'openai', modelId: 'gpt-image-1' },
        }),
      );
      const deps = createDependencies({
        generateImage: async () => {
          throw requestError;
        },
      });
      const tool = createGenerateImageTool(deps, MODEL, TURN_FILES);

      const result = await execute(tool, { prompt: 'A cherry.' });
      expect(result.failure).toEqual({
        scope: 'call',
        error: {
          code: 'image_provider_error',
          message: requestError.detail.message,
          retryable,
          origin: 'provider',
          name: 'APIError',
          context: requestError.detail.failure.context,
        },
      });
      expect(toolResultDiagnostics(tool.ref, result)).toMatchObject({
        status: 'error',
        attributes: {
          'error.code': 'image_provider_error',
          'error.retryable': retryable,
          'error.origin': 'provider',
          'http.status_code': statusCode,
        },
      });
      expect(deps.ai.generateImage).toHaveBeenCalledTimes(1);
      expect(deps.files.createInternalEntry).not.toHaveBeenCalled();
    },
  );

  test('does not turn cancellation into a failed tool result', async () => {
    const controller = new AbortController();
    const abort = new Error('Cancelled');
    const deps = createDependencies({
      generateImage: async () => {
        controller.abort(abort);
        throw abort;
      },
    });
    const tool = createGenerateImageTool(deps, MODEL, TURN_FILES);
    await expect(
      tool.execute({
        input: { prompt: 'A cherry.' },
        signal: controller.signal,
        toolCallId: 'call-1',
        turnId: 'turn-1',
      }),
    ).rejects.toBe(abort);
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

    expect(result.failure).toMatchObject({
      scope: 'call',
      error: { code: 'image_storage_failed', origin: 'tool', retryable: false },
    });
    expect(result.failure?.error.message).not.toContain('provider');
    // A partial generation must not leave orphan rows in the file library.
    expect(deps.files.discard).toHaveBeenCalledWith([ENTRY]);
  });

  test('does not report an empty provider response as a successful generation', async () => {
    const deps = createDependencies();
    deps.ai.generateImage.mockResolvedValue({ images: [] });
    const tool = createGenerateImageTool(deps, MODEL, TURN_FILES);
    const result = await execute(tool, { prompt: 'A cherry.' });
    expect(result.failure?.error.code).toBe('image_generation_empty');
    expect(result.artifacts).toEqual([]);
    expect(deps.files.createInternalEntry).not.toHaveBeenCalled();
  });

  test('rejects an empty prompt without calling the provider', async () => {
    const deps = createDependencies();
    const tool = createGenerateImageTool(deps, MODEL, TURN_FILES);

    const result = await execute(tool, { prompt: '   ' });

    expect(deps.ai.generateImage).not.toHaveBeenCalled();
    expect(result.failure).toMatchObject({
      scope: 'call',
      error: { code: 'invalid_image_request', retryable: true },
    });
  });

  test('rejects an image id outside the turn before reading the file', async () => {
    const deps = createDependencies();
    const tool = createGenerateImageTool(deps, EDIT_MODEL, { fileEntryIds: new Set() });

    const result = await execute(tool, {
      image_ids: [ENTRY.id],
      prompt: 'Turn this into a watercolor.',
    });

    expect(result.failure?.error).toMatchObject({
      code: 'image_reference_not_authorized',
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

    expect(result.failure?.error).toMatchObject({
      code: 'image_reference_unavailable',
      message: expect.stringContaining('attach it again'),
    });
    expect(result.artifacts).toEqual([]);
    expect(deps.files.readDataUrl).not.toHaveBeenCalled();
    expect(deps.ai.generateImage).not.toHaveBeenCalled();
    expect(deps.files.createInternalEntry).not.toHaveBeenCalled();
  });

  test('reports shared attachment rejection before reading bytes or generating', async () => {
    const deps = createDependencies();
    jest.mocked(deps.files.resolve).mockResolvedValue({
      entry: { ...ENTRY, size: MAX_IMAGE_ATTACHMENT_BYTES + 1 },
      uri: 'file:///large-image.png',
    });
    const tool = createGenerateImageTool(deps, EDIT_MODEL, TURN_FILES);
    const result = await execute(tool, { image_ids: [ENTRY.id], prompt: 'Make it blue.' });
    expect(result.failure).toMatchObject({
      scope: 'call',
      error: {
        code: 'image_reference_invalid',
        message: expect.stringContaining('file-bytes'),
        retryable: false,
      },
    });
    expect(deps.files.readDataUrl).not.toHaveBeenCalled();
    expect(deps.ai.generateImage).not.toHaveBeenCalled();
  });

  test('publishes a parameter shared by generate and edit with a concrete type', () => {
    const quality = { type: 'enum' as const, options: ['low', 'high'] };
    const tool = createGenerateImageTool(
      createDependencies(),
      configuredModel({
        imageGeneration: {
          modes: { generate: { supports: { quality } }, edit: { supports: { quality } } },
        },
      }),
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

function configuredModel(overrides: Partial<Model> = {}): ConfiguredPaintingModel {
  const uniqueModelId = createUniqueModelId('openai', 'gpt-image-1');
  return {
    uniqueModelId,
    model: {
      id: uniqueModelId,
      providerId: 'openai',
      modelId: 'gpt-image-1',
      name: 'Image',
      capabilities: ['image-generation'],
      supportsStreaming: false,
      isEnabled: true,
      isHidden: false,
      ...overrides,
    },
  };
}

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

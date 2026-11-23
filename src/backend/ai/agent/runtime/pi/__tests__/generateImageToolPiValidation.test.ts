import { bundledModels } from '@cherrystudio/provider-registry/data/models';
import { validateToolArguments } from '@earendil-works/pi-ai/utils/validation';

import { FileEntrySchema } from '@/shared/data/types/file';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import type { TurnFileScope } from '../../../resources/managedFileResolver';
import type {
  ConfiguredPaintingModel,
  PaintingToolDependencies,
} from '../../../tools/painting/generateImage';
import { createGenerateImageTool } from '../../../tools/painting/generateImageTool';
import type { RuntimeJsonValue, RuntimeTool, RuntimeToolResult } from '../../types';

const ENTRY = FileEntrySchema.parse({
  createdAt: 1_756_166_400_000,
  filename: 'image.png',
  id: '00000000-0000-7000-8000-000000000001',
  mediaType: 'image/png',
  provenance: 'generated',
  size: 12,
  updatedAt: 1_756_166_400_000,
});

const EDIT_MODEL = configuredModel({ imageGeneration: { modes: { edit: { supports: {} } } } });
const REFERENCE_MODELS = [
  {
    name: 'generation and editing',
    model: configuredModel({
      imageGeneration: { modes: { generate: { supports: {} }, edit: { supports: {} } } },
    }),
  },
  {
    name: 'reference-capable generation only',
    model: configuredModel({
      imageGeneration: { modes: { generate: { supports: {}, maxInputImages: 2 } } },
    }),
  },
];

const TURN_FILES: TurnFileScope = { fileEntryIds: new Set([ENTRY.id]) };

describe('createGenerateImageTool', () => {
  describe.each(REFERENCE_MODELS)('generation with $name', ({ model }) => {
    test.each([[], [''], [' ']].map((image_ids) => ({ image_ids })))(
      'generates without a reference for $image_ids',
      async ({ image_ids }) => {
        const deps = createDependencies();
        const tool = createGenerateImageTool(deps, model, TURN_FILES);
        const toolCall = {
          type: 'toolCall' as const,
          id: 'call-1',
          name: tool.providerName,
          arguments: { prompt: 'A cherry orchard at dawn', image_ids },
        };
        const original = structuredClone(toolCall.arguments);
        const input = validateToolArguments(
          {
            name: tool.providerName,
            description: tool.description,
            parameters: tool.inputSchema as Record<string, unknown>,
          },
          toolCall,
        );
        expect(input).toEqual(original);
        expect(input).not.toBe(toolCall.arguments);
        expect(input.image_ids).not.toBe(toolCall.arguments.image_ids);

        const result = await execute(tool, input);
        expect(result.failure).toBeUndefined();
        expect(result.value).toEqual([{ id: ENTRY.id, name: ENTRY.filename }]);
        expect(result.artifacts).toHaveLength(1);
        expect(deps.ai.generateImage).toHaveBeenCalledTimes(1);
        expect(deps.ai.generateImage.mock.calls[0][0]).toMatchObject({ mode: 'generate' });
        expect(deps.ai.generateImage.mock.calls[0][0]).not.toHaveProperty('inputImages');
        expect(deps.files.resolve).not.toHaveBeenCalled();
        expect(deps.files.readDataUrl).not.toHaveBeenCalled();
        input.image_ids.push(ENTRY.id);
        expect(toolCall.arguments).toEqual(original);
      },
    );
  });

  test('accepts the reported gpt-image-2 poster request with a blank reference', async () => {
    const definition = bundledModels.models.find((entry) => entry.id === 'gpt-image-2')!;
    const model = configuredModel({
      modelId: definition.id,
      inputModalities: definition.inputModalities,
      imageGeneration: definition.imageGeneration,
    });
    const deps = createDependencies();
    const tool = createGenerateImageTool(deps, model, TURN_FILES);
    const args = {
      prompt: '生成中国宣传海报',
      image_ids: [' '],
      background: 'opaque',
      numImages: 1,
      quality: 'high',
      size: '1024x1536',
    };
    const input = validateToolArguments(
      {
        name: tool.providerName,
        description: tool.description,
        parameters: tool.inputSchema as Record<string, unknown>,
      },
      { type: 'toolCall', id: 'poster', name: tool.providerName, arguments: args },
    );
    expect((await execute(tool, input)).failure).toBeUndefined();
    expect(deps.ai.generateImage.mock.calls[0][0]).toMatchObject({
      mode: 'generate',
      prompt: args.prompt,
      paramValues: {
        background: 'opaque',
        numImages: 1,
        quality: 'high',
        size: '1024x1536',
      },
    });
    expect(deps.files.resolve).not.toHaveBeenCalled();
  });

  describe.each([
    ...REFERENCE_MODELS.map((fixture) => ({ ...fixture, canGenerate: true })),
    { name: 'editing only', model: EDIT_MODEL, canGenerate: false },
  ])('Pi reference coercion: $name', ({ model, canGenerate }) => {
    test.each(
      [null, ...(!canGenerate ? [[], [''], ['   ']] : [])].map((imageIds) => ({ imageIds })),
    )(
      'preserves the original arguments across validation and execution: %j',
      async ({ imageIds }) => {
        const deps = createDependencies();
        const tool = createGenerateImageTool(deps, model, TURN_FILES);
        const toolCall = {
          type: 'toolCall' as const,
          id: 'call-1',
          name: tool.providerName,
          arguments: { prompt: 'A cherry.', image_ids: imageIds },
        };
        const original = structuredClone(toolCall.arguments);
        const validate = () =>
          validateToolArguments(
            {
              name: tool.providerName,
              description: tool.description,
              parameters: tool.inputSchema as Record<string, unknown>,
            },
            toolCall,
          );
        if (imageIds !== null && (imageIds.length === 0 || imageIds[0] === '')) {
          expect(validate).toThrow(/generate_image[\s\S]*image_ids/);
        } else {
          const input = validate();
          const result = await execute(tool, input);
          if (imageIds === null && canGenerate) {
            expect(input).not.toHaveProperty('image_ids');
            expect(result.failure).toBeUndefined();
            expect(result.artifacts).toHaveLength(1);
            expect(deps.ai.generateImage).toHaveBeenCalledTimes(1);
            expect(deps.ai.generateImage.mock.calls[0][0]).not.toHaveProperty('inputImages');
          } else {
            expect(result.failure?.error.code).toBe(
              imageIds === null ? 'image_reference_not_authorized' : 'invalid_image_request',
            );
            if (imageIds === null) expect(input.image_ids).toEqual(['null']);
            expect(result.artifacts).toEqual([]);
          }
        }
        if (!(imageIds === null && canGenerate)) {
          expect(deps.ai.generateImage).not.toHaveBeenCalled();
          expect(deps.files.createInternalEntry).not.toHaveBeenCalled();
        }
        expect(deps.files.resolve).not.toHaveBeenCalled();
        expect(deps.files.readDataUrl).not.toHaveBeenCalled();
        expect(toolCall.arguments).toEqual(original);
      },
    );
  });
});

function configuredModel(overrides: Partial<Model> = {}): ConfiguredPaintingModel {
  const uniqueModelId = createUniqueModelId('openai', overrides.modelId ?? 'gpt-image-1');
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

function createDependencies() {
  return {
    ai: {
      generateImage: jest.fn(async () => ({
        images: [{ base64: 'AAAA', mediaType: 'image/png' }],
      })),
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

import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import type { AiImageRequest } from '@/backend/ai/AiService';
import { FileEntrySchema } from '@/shared/data/types/file';
import { createUniqueModelId, type Model } from '@/shared/data/types/model';

import { createTurnResourceLedger } from '../../resources/managedFileResolver';
import { createAgentImageGeneration } from '../agentImageGeneration';

const ENTRY = FileEntrySchema.parse({
  id: '00000000-0000-7000-8000-000000000001',
  filename: 'cherry.png',
  mediaType: 'image/png',
  provenance: 'generated',
  createdAt: 1,
  updatedAt: 1,
  size: 12,
});
const MODEL: Model = {
  id: createUniqueModelId('provider', 'image'),
  providerId: 'provider',
  modelId: 'image',
  name: 'Image',
  capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
  inputModalities: ['text', 'image'],
  outputModalities: ['image'],
  isEnabled: true,
  isHidden: false,
  supportsStreaming: false,
  imageGeneration: {
    modes: {
      generate: {
        supports: {
          aspectRatio: { type: 'enum', options: ['16:9'] },
          numImages: { type: 'range', min: 1, max: 4 },
        },
        maxInputImages: 2,
      },
    },
  },
};
const ATTRIBUTION = { source: null, messageRef: null };

function harness(model = MODEL) {
  const dependencies = {
    ai: {
      generateImage: jest.fn(async (_input: AiImageRequest) => ({
        images: [{ base64: 'image-bytes', mediaType: 'image/png' }],
      })),
    },
    files: { readAsDataUrl: jest.fn(async () => 'data:image/png;base64,reference') },
    models: { getById: jest.fn(async () => model) },
    storage: {
      createInternalEntry: jest.fn(async () => ENTRY),
      discard: jest.fn(async () => undefined),
    },
  };
  return { ...dependencies, capability: createAgentImageGeneration(dependencies) };
}

function input(withImage = false) {
  const files = new Map(
    withImage
      ? [
          [
            ENTRY.id,
            {
              fileEntryId: ENTRY.id,
              name: ENTRY.filename,
              mediaType: ENTRY.mediaType,
              size: ENTRY.size,
            },
          ],
        ]
      : [],
  );
  return {
    instructions: 'Use watercolor.',
    model: { providerId: 'provider', modelId: 'image' },
    parts: [{ type: 'text' as const, text: 'A cherry' }],
    resources: createTurnResourceLedger(files, []),
    signal: new AbortController().signal,
  };
}

describe('Agent image generation', () => {
  test('uses the selected model, Agent instructions, explicit reference, and captured parameters', async () => {
    const { capability, ai, storage } = harness();
    const settings = {
      mode: 'generate' as const,
      paramValues: { aspectRatio: '16:9', numImages: 1 },
    };
    const plan = await capability.prepare({ ...input(true), settings });
    expect(plan?.settings).toEqual(settings);
    const entries = await plan?.execute(new AbortController().signal, ATTRIBUTION);
    expect(entries).toEqual([ENTRY]);
    expect(ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueModelId: MODEL.id,
        mode: 'generate',
        paramValues: settings.paramValues,
        prompt: 'Use watercolor.\n\nA cherry',
        inputImages: ['data:image/png;base64,reference'],
        usageAttribution: ATTRIBUTION,
      }),
    );
    expect(storage.createInternalEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'A cherry.png',
        provenance: 'generated',
        source: 'base64',
      }),
    );
  });

  test('does not send an image request for a text model', async () => {
    const { capability, ai } = harness({ ...MODEL, capabilities: [], imageGeneration: undefined });
    expect(await capability.prepare(input())).toBeNull();
    await expect(
      capability.prepare({ ...input(), settings: { mode: 'generate', paramValues: {} } }),
    ).rejects.toThrow();
    expect(ai.generateImage).not.toHaveBeenCalled();
  });

  test('rejects unsupported input modes before creating outputs', async () => {
    const { capability, ai } = harness({
      ...MODEL,
      imageGeneration: { modes: { edit: { supports: {}, maxInputImages: 1 } } },
    });
    await expect(capability.prepare(input())).rejects.toThrow();
    await expect(
      capability.prepare({ ...input(true), settings: { mode: 'generate', paramValues: {} } }),
    ).rejects.toThrow();
    expect(ai.generateImage).not.toHaveBeenCalled();
  });

  test('discards an imported output if cancellation occurs during its import', async () => {
    const { capability, storage } = harness();
    const controller = new AbortController();
    storage.createInternalEntry.mockImplementation(async () => {
      controller.abort(new Error('Cancelled'));
      return ENTRY;
    });
    const plan = await capability.prepare(input());
    await expect(plan?.execute(controller.signal, ATTRIBUTION)).rejects.toThrow('Cancelled');
    expect(storage.discard).toHaveBeenCalledWith([ENTRY]);
  });

  test('rejects invalid parameters during admission without executing or creating files', async () => {
    const { capability, ai, storage } = harness();
    await expect(
      capability.prepare({
        ...input(),
        settings: { mode: 'generate', paramValues: { numImages: 20 } },
      }),
    ).rejects.toMatchObject({ issue: { code: 'invalid-parameters' } });
    expect(ai.generateImage).not.toHaveBeenCalled();
    expect(storage.createInternalEntry).not.toHaveBeenCalled();
  });

  test('cancellation settles even when the provider ignores its signal', async () => {
    const { capability, ai, storage } = harness();
    const controller = new AbortController();
    ai.generateImage.mockImplementation(() => {
      controller.abort(new Error('Cancelled'));
      return new Promise(() => {});
    });
    const plan = await capability.prepare(input());
    await expect(plan?.execute(controller.signal, ATTRIBUTION)).rejects.toThrow('Cancelled');
    expect(storage.createInternalEntry).not.toHaveBeenCalled();
  });

  test('rejects empty provider output without creating a successful image response', async () => {
    const { capability, ai, storage } = harness();
    ai.generateImage.mockResolvedValueOnce({ images: [] });
    const plan = await capability.prepare(input());
    await expect(plan?.execute(new AbortController().signal, ATTRIBUTION)).rejects.toThrow(
      'no image',
    );
    expect(storage.createInternalEntry).not.toHaveBeenCalled();
  });
});

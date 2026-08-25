import type { ImageGenerationSupport } from '@cherrystudio/provider-registry';

import type { FileEntry } from '@/shared/data/types/file';

import {
  generateImageFromPrompt,
  PAINTING_EDIT_NOT_SUPPORTED_NOTE,
  PAINTING_ERROR_NOTE,
  PAINTING_MODEL_NOT_CONFIGURED_NOTE,
  type PaintingToolDependencies,
  resolveConfiguredPaintingModel,
} from '../painting';

const MODEL_ID = 'openai::gpt-image-1' as const;
const INPUT_ID = '00000000-0000-7000-8000-000000000001';
const OUTPUT_ID = '00000000-0000-7000-8000-000000000002';

const generateSupport = {
  modes: {
    generate: {
      supports: {
        numImages: { max: 3, min: 1, type: 'range' },
        size: { options: ['1024x1024', '1792x1024'], type: 'enum' },
      },
    },
  },
} satisfies ImageGenerationSupport;

const editableSupport = {
  modes: {
    edit: { supports: { quality: { options: ['low', 'high'], type: 'enum' } } },
    generate: { supports: { size: { options: ['1024x1024'], type: 'enum' } } },
  },
} satisfies ImageGenerationSupport;

function fileEntry(id = OUTPUT_ID): FileEntry {
  return {
    createdAt: 1,
    filename: 'painting.png',
    id,
    mediaType: 'image/png',
    size: 4,
    updatedAt: 1,
  } as FileEntry;
}

function createDependencies(
  options: {
    modelId?: string | null;
    support?: ImageGenerationSupport | null;
  } = {},
) {
  const support = options.support === undefined ? generateSupport : options.support;
  const dependencies = {
    ai: {
      generateImage: jest.fn(async () => ({
        images: [{ base64: 'AAAA', mediaType: 'image/png' }],
      })),
    },
    files: {
      createInternalEntry: jest.fn(async () => fileEntry()),
      discard: jest.fn(async () => undefined),
      readDataUrl: jest.fn(async () => 'data:image/png;base64,INPUT'),
      resolve: jest.fn(async () => ({ entry: fileEntry(INPUT_ID), uri: 'file:///input.png' })),
    },
    preference: {
      get: jest.fn(async () => (options.modelId === undefined ? MODEL_ID : options.modelId)),
    },
    providerRegistry: {
      getImageGenerationSupport: jest.fn(() => support),
    },
  } as unknown as PaintingToolDependencies;
  return dependencies;
}

describe('painting tool core', () => {
  test('resolves the configured drawing model and its capability contract', async () => {
    const dependencies = createDependencies({ support: editableSupport });

    await expect(resolveConfiguredPaintingModel(dependencies)).resolves.toEqual({
      support: editableSupport,
      uniqueModelId: MODEL_ID,
    });
    expect(dependencies.providerRegistry.getImageGenerationSupport).toHaveBeenCalledWith(
      'openai',
      'gpt-image-1',
    );
  });

  test('generates and persists image output with canonical model parameters', async () => {
    const dependencies = createDependencies();

    await expect(
      generateImageFromPrompt(dependencies, {
        numImages: 1,
        prompt: 'a red paper lantern',
        size: '1792x1024',
      }),
    ).resolves.toEqual([{ id: OUTPUT_ID, name: 'painting.png' }]);

    expect(dependencies.ai.generateImage).toHaveBeenCalledWith({
      mode: 'generate',
      paramValues: { numImages: 1, size: '1792x1024' },
      prompt: 'a red paper lantern',
      requestOptions: undefined,
      uniqueModelId: MODEL_ID,
    });
    expect(dependencies.files.createInternalEntry).toHaveBeenCalledWith({
      data: 'AAAA',
      mediaType: 'image/png',
      source: 'base64',
    });
  });

  test('resolves an image reference and selects edit mode', async () => {
    const dependencies = createDependencies({ support: editableSupport });

    await generateImageFromPrompt(dependencies, {
      image_ids: [INPUT_ID],
      prompt: 'make it blue',
      quality: 'high',
    });

    expect(dependencies.files.resolve).toHaveBeenCalledWith(INPUT_ID);
    expect(dependencies.ai.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        inputImages: ['data:image/png;base64,INPUT'],
        mode: 'edit',
        paramValues: { quality: 'high' },
      }),
    );
  });

  test('returns a permanent note when no model is configured', async () => {
    const dependencies = createDependencies({ modelId: null });

    await expect(generateImageFromPrompt(dependencies, { prompt: 'a cat' })).resolves.toEqual({
      error: PAINTING_MODEL_NOT_CONFIGURED_NOTE,
    });
    expect(dependencies.ai.generateImage).not.toHaveBeenCalled();
  });

  test('rejects edits before reading files when the model cannot edit', async () => {
    const dependencies = createDependencies();

    await expect(
      generateImageFromPrompt(dependencies, { image_ids: [INPUT_ID], prompt: 'edit it' }),
    ).resolves.toEqual({ error: PAINTING_EDIT_NOT_SUPPORTED_NOTE });
    expect(dependencies.files.resolve).not.toHaveBeenCalled();
  });

  test('discards partially persisted output when storage fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    try {
      const dependencies = createDependencies();
      const first = fileEntry();
      jest.mocked(dependencies.ai.generateImage).mockResolvedValueOnce({
        images: [
          { base64: 'AAAA', mediaType: 'image/png' },
          { base64: 'BBBB', mediaType: 'image/png' },
        ],
      });
      jest
        .mocked(dependencies.files.createInternalEntry)
        .mockResolvedValueOnce(first)
        .mockRejectedValueOnce(new Error('disk full'));

      await expect(generateImageFromPrompt(dependencies, { prompt: 'a cat' })).resolves.toEqual({
        error: PAINTING_ERROR_NOTE,
      });
      expect(dependencies.files.discard).toHaveBeenCalledWith([first]);
    } finally {
      consoleError.mockRestore();
    }
  });

  test('propagates cancellation instead of returning a retryable tool error', async () => {
    const dependencies = createDependencies();
    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    jest.mocked(dependencies.ai.generateImage).mockRejectedValueOnce(abortError);

    await expect(generateImageFromPrompt(dependencies, { prompt: 'a cat' })).rejects.toBe(
      abortError,
    );
  });

  test('discards output when cancellation arrives during persistence', async () => {
    const dependencies = createDependencies();
    const controller = new AbortController();
    const abortError = new Error('cancelled');
    const generatedFile = fileEntry();
    jest.mocked(dependencies.files.createInternalEntry).mockImplementationOnce(async () => {
      controller.abort(abortError);
      return generatedFile;
    });

    await expect(
      generateImageFromPrompt(dependencies, { prompt: 'a cat' }, controller.signal),
    ).rejects.toBe(abortError);
    expect(dependencies.files.discard).toHaveBeenCalledWith([generatedFile]);
  });
});

import {
  ENDPOINT_TYPE,
  type ImageGenerationSupport,
  MODALITY,
  MODEL_CAPABILITY,
} from '@cherrystudio/provider-registry';

import { createUniqueModelId, type Model } from '@/shared/data/types/model';
import {
  getImageParamFields,
  imageParamsAspectRatio,
  parseImageRatio,
  isImageParamDraftValid,
  prepareImageParamRequest,
  prepareImageParamValues,
  reconcileImageParamDraft,
  resolveImageGenerationMode,
  updateImageParamDraft,
} from '@/shared/utils/imageGenerationParams';
import { resolvePaintingGenerationMode } from '@/shared/utils/paintingModelSupport';

const support = {
  modes: {
    generate: {
      supports: {
        size: {
          default: 'auto',
          options: ['auto', '1024x1024'],
          render: 'chips',
          type: 'enum',
        },
        customSize: {
          maxSide: 2048,
          minSide: 512,
          pairedEnumKey: 'size',
          type: 'size',
        },
        numImages: { default: 2, max: 4, min: 1, type: 'range' },
        quality: { default: 'high', options: ['low', 'high'], type: 'enum' },
        promptEnhancement: { default: true, type: 'switch' },
        negativePrompt: { multiline: true, type: 'text' },
      },
    },
    edit: {
      maxInputImages: 2,
      requirePrompt: false,
      supports: {
        strength: { default: 0.5, max: 1, min: 0, step: 0.1, type: 'range' },
      },
    },
  },
} satisfies ImageGenerationSupport;

describe('image generation parameter resolution', () => {
  it('prefers generate without inputs and edit with inputs', () => {
    const selected = model({ imageGeneration: support });
    expect(resolvePaintingGenerationMode(selected, false)).toBe('generate');
    expect(resolvePaintingGenerationMode(selected, true)).toBe('edit');
    expect(resolveImageGenerationMode(support, 'edit')?.definition).toBe(support.modes.edit);
  });

  it('does not offer edit-only models without an input image', () => {
    const editOnly = {
      modes: { edit: { supports: {} } },
    } satisfies ImageGenerationSupport;

    expect(
      resolvePaintingGenerationMode(model({ imageGeneration: editOnly }), false),
    ).toBeUndefined();
    expect(resolveImageGenerationMode(editOnly, 'generate')).toBeUndefined();
    expect(resolveImageGenerationMode(undefined, 'generate')).toBeUndefined();
  });

  it('keeps generate mode and its parameters for models accepting reference images', () => {
    const selected = model({
      inputModalities: [MODALITY.TEXT, MODALITY.IMAGE],
      imageGeneration: { modes: { generate: support.modes.generate } },
    });
    const mode = resolvePaintingGenerationMode(selected, true);
    expect(mode).toBe('generate');
    expect(resolveImageGenerationMode(selected.imageGeneration, mode)?.definition).toBe(
      support.modes.generate,
    );
  });

  it('honors reference-image limits even when modality metadata is missing or disagrees', () => {
    expect(
      resolvePaintingGenerationMode(
        model({
          imageGeneration: { modes: { generate: { maxInputImages: 3, supports: {} } } },
        }),
        true,
      ),
    ).toBe('generate');
    expect(
      resolvePaintingGenerationMode(
        model({
          inputModalities: [MODALITY.IMAGE],
          imageGeneration: { modes: { generate: { maxInputImages: 0, supports: {} } } },
        }),
        true,
      ),
    ).toBeUndefined();
  });

  it('filters models by the requested generate or edit interaction', () => {
    expect(
      resolvePaintingGenerationMode(model({ imageGeneration: support }), false) !== undefined,
    ).toBe(true);
    expect(
      resolvePaintingGenerationMode(model({ imageGeneration: support }), true) !== undefined,
    ).toBe(true);
    expect(
      resolvePaintingGenerationMode(
        model({ imageGeneration: { modes: { generate: { supports: {} } } } }),
        true,
      ) !== undefined,
    ).toBe(false);
  });

  it('falls back to exact image endpoint declarations when Registry metadata is absent', () => {
    const generateOnly = model({
      endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
    });
    const editOnly = model({
      endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS, ENDPOINT_TYPE.OPENAI_IMAGE_EDIT],
    });

    expect(resolvePaintingGenerationMode(generateOnly, false) !== undefined).toBe(true);
    expect(resolvePaintingGenerationMode(generateOnly, true) !== undefined).toBe(false);
    expect(resolvePaintingGenerationMode(editOnly, false) !== undefined).toBe(false);
    expect(resolvePaintingGenerationMode(editOnly, true) !== undefined).toBe(true);
  });

  it('accepts reference images for a generation endpoint that declares image input', () => {
    const visionGenerate = model({
      endpointTypes: [ENDPOINT_TYPE.OPENAI_IMAGE_GENERATION],
      inputModalities: [MODALITY.TEXT, MODALITY.IMAGE],
    });

    expect(resolvePaintingGenerationMode(visionGenerate, false)).toBe('generate');
    expect(resolvePaintingGenerationMode(visionGenerate, true)).toBe('edit');
  });

  it('retains capability and modality fallback for legacy image models', () => {
    const generateModel = model({ capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION] });
    const editModel = model({
      capabilities: [MODEL_CAPABILITY.IMAGE_GENERATION],
      inputModalities: [MODALITY.IMAGE],
    });

    expect(resolvePaintingGenerationMode(generateModel, false) !== undefined).toBe(true);
    expect(resolvePaintingGenerationMode(generateModel, true) !== undefined).toBe(false);
    expect(resolvePaintingGenerationMode(editModel, true) !== undefined).toBe(true);
    expect(resolvePaintingGenerationMode(undefined, false) !== undefined).toBe(false);
  });
});

describe('image generation parameter drafts', () => {
  const generateMode = resolveImageGenerationMode(support, 'generate');

  it('applies defaults and preserves supported values', () => {
    expect(
      reconcileImageParamDraft(
        {
          negativePrompt: 'no blur',
          numImages: 3,
          staleProviderField: true,
        },
        generateMode,
      ),
    ).toEqual({
      negativePrompt: 'no blur',
      numImages: 3,
      promptEnhancement: true,
      quality: 'high',
      size: 'auto',
    });
  });

  it('resets invalid enum, range, and custom-size values together', () => {
    expect(
      reconcileImageParamDraft(
        {
          customSize_height: 768,
          customSize_width: 100,
          numImages: 10,
          quality: 'ultra',
          size: 'custom',
        },
        generateMode,
      ),
    ).toEqual({
      numImages: 2,
      promptEnhancement: true,
      quality: 'high',
      size: 'auto',
    });
  });

  it('composes a valid custom size and strips helper and empty fields', () => {
    const draft = {
      customSize_height: '768',
      customSize_width: '1024',
      negativePrompt: '',
      numImages: '3',
      size: 'custom',
    };

    expect(isImageParamDraftValid(draft, generateMode)).toBe(true);
    expect(prepareImageParamValues(draft, support, generateMode)).toEqual({
      numImages: 3,
      size: '1024x768',
    });
  });

  it('rejects an invalid custom size and returns no params without a Registry mode', () => {
    const draft = {
      customSize_height: 768,
      customSize_width: 100,
      size: 'custom',
    };

    expect(isImageParamDraftValid(draft, generateMode)).toBe(false);
    expect(() => prepareImageParamValues(draft, support, generateMode)).toThrow(
      'Invalid custom image size',
    );
    expect(prepareImageParamValues({ seed: 4 }, undefined, undefined)).toEqual({});
  });
});

describe('GIF parameter constraints', () => {
  const gifSupport = {
    modes: {
      generate: {
        supports: {
          outputFormat: { type: 'enum', options: ['png', 'jpeg', 'webp', 'gif'] },
          size: {
            type: 'enum',
            options: ['auto', '1024x1024', '1536x1024', '1024x1536'],
            default: '1024x1024',
          },
          background: { type: 'enum', options: ['auto', 'transparent', 'opaque'] },
          numImages: { type: 'range', min: 1, max: 10, default: 1 },
        },
      },
    },
  } satisfies ImageGenerationSupport;
  const mode = resolveImageGenerationMode(gifSupport, 'generate');
  const defaultGifSupport = {
    modes: {
      generate: {
        supports: {
          ...gifSupport.modes.generate.supports,
          outputFormat: { ...gifSupport.modes.generate.supports.outputFormat, default: 'gif' },
        },
      },
    },
  } satisfies ImageGenerationSupport;
  const defaultGifMode = resolveImageGenerationMode(defaultGifSupport, 'generate');

  it('submits the default GIF format with compatible initial controls', () => {
    const draft = reconcileImageParamDraft(
      { size: '1024x1024', background: 'transparent' },
      defaultGifMode,
    );
    expect(draft).toEqual({ outputFormat: 'gif', size: 'auto', numImages: 1 });
    expect(isImageParamDraftValid(draft, defaultGifMode)).toBe(true);
    expect(prepareImageParamRequest(draft, defaultGifMode)).toEqual(draft);
    expect(prepareImageParamRequest({}, defaultGifMode)).toEqual({ outputFormat: 'gif' });
  });

  it.each(['png', 'jpeg', 'webp'])(
    'preserves an explicit %s choice over default GIF',
    (outputFormat) => {
      const draft = { outputFormat, size: '1024x1024', background: 'transparent' };
      expect(reconcileImageParamDraft({ outputFormat }, defaultGifMode)).toEqual({
        outputFormat,
        size: '1024x1024',
        numImages: 1,
      });
      expect(prepareImageParamRequest(draft, defaultGifMode)).toEqual(draft);
    },
  );

  it('uses automatic size and clears transparent background when selecting GIF', () => {
    const draft = reconcileImageParamDraft({ background: 'transparent' }, mode);
    expect(draft.size).toBe('1024x1024');
    const next = updateImageParamDraft(draft, 'outputFormat', 'gif', mode);

    expect(next).toEqual({ outputFormat: 'gif', size: 'auto', numImages: 1 });
    expect(isImageParamDraftValid(next, mode)).toBe(true);
    expect(prepareImageParamValues(next, gifSupport, mode)).toEqual(next);
    expect(draft).toMatchObject({ background: 'transparent', size: '1024x1024' });
  });

  it('preserves unrelated invalid edits and still-image defaults', () => {
    expect(
      updateImageParamDraft(
        { size: '1024x1024', background: 'opaque', numImages: 100 },
        'outputFormat',
        'gif',
        mode,
      ),
    ).toEqual({ outputFormat: 'gif', size: 'auto', background: 'opaque', numImages: 100 });
    expect(
      updateImageParamDraft(
        { size: '1024x1024', background: 'transparent' },
        'outputFormat',
        'png',
        mode,
      ),
    ).toEqual({ outputFormat: 'png', size: '1024x1024', background: 'transparent' });
    expect(reconcileImageParamDraft({}, mode).size).toBe('1024x1024');
  });

  it('offers only GIF-compatible dimensions and backgrounds without mutating the catalog', () => {
    const fields = getImageParamFields(mode, { outputFormat: 'gif' });
    expect(fields.find(({ key }) => key === 'size')?.spec).toMatchObject({
      options: ['auto'],
      default: 'auto',
    });
    expect(fields.find(({ key }) => key === 'background')?.spec).toMatchObject({
      options: ['auto', 'opaque'],
    });
    expect(gifSupport.modes.generate.supports.size.options).toContain('1024x1024');
    expect(gifSupport.modes.generate.supports.background.options).toContain('transparent');
  });

  it.each([
    { outputFormat: 'gif', size: '1024x1024' },
    { outputFormat: 'gif', size: 'auto', background: 'transparent' },
  ])('rejects incompatible explicit GIF parameters at validation: %j', (draft) => {
    expect(isImageParamDraftValid(draft, mode)).toBe(false);
    expect(prepareImageParamRequest(draft, mode)).toBeUndefined();
  });

  it('admits omitted and automatic GIF controls for server defaults', () => {
    expect(prepareImageParamRequest({ outputFormat: 'gif' }, mode)).toEqual({
      outputFormat: 'gif',
    });
    expect(
      prepareImageParamRequest({ outputFormat: 'gif', size: 'auto', background: 'opaque' }, mode),
    ).toEqual({ outputFormat: 'gif', size: 'auto', background: 'opaque' });
  });
});

function model(overrides: Partial<Model> = {}): Model {
  return {
    capabilities: [],
    id: createUniqueModelId('test-provider', 'image-model'),
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId: 'image-model',
    name: 'Image Model',
    providerId: 'test-provider',
    supportsStreaming: true,
    ...overrides,
  };
}

describe('placeholder tile sizing', () => {
  it('prefers an explicit ratio, then a pixel size, and squares off when neither is set', () => {
    expect(imageParamsAspectRatio({ aspectRatio: '16:9' })).toBeCloseTo(16 / 9);
    expect(imageParamsAspectRatio({ aspectRatio: 'ASPECT_16_9' })).toBeCloseTo(16 / 9);
    expect(parseImageRatio('ASPECT_3_4')).toEqual({ width: 3, height: 4 });
    expect(imageParamsAspectRatio({ size: '1024x768' })).toBeCloseTo(4 / 3);
    expect(imageParamsAspectRatio({ imageResolution: '512X1024' })).toBeCloseTo(0.5);
    // Ratio wins: `size` may be the provider's own pixel spelling of it.
    expect(imageParamsAspectRatio({ aspectRatio: '1:2', size: '1024x1024' })).toBeCloseTo(0.5);
    expect(imageParamsAspectRatio(undefined)).toBe(1);
    expect(imageParamsAspectRatio({})).toBe(1);
  });

  it('falls back to square rather than trusting junk from the ledger', () => {
    expect(imageParamsAspectRatio({ aspectRatio: 'auto' })).toBe(1);
    expect(imageParamsAspectRatio({ size: '0x1024' })).toBe(1);
    expect(imageParamsAspectRatio({ size: '1024' })).toBe(1);
  });
});

import type { ImageGenerationSupport } from '@cherrystudio/provider-registry';

import {
  imageParamsAspectRatio,
  imageParamsResolutionLabel,
  isImageParamDraftValid,
  prepareImageParamValues,
  reconcileImageParamDraft,
  resolveImageGenerationMode,
} from '../imageGenerationParams';

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
    expect(resolveImageGenerationMode(support, false)?.mode).toBe('generate');
    expect(resolveImageGenerationMode(support, true)?.mode).toBe('edit');
  });

  it('falls back to the first declared mode when the preferred mode is unavailable', () => {
    const editOnly = {
      modes: { edit: { supports: {} } },
    } satisfies ImageGenerationSupport;

    expect(resolveImageGenerationMode(editOnly, false)?.mode).toBe('edit');
    expect(resolveImageGenerationMode(undefined, false)).toBeUndefined();
  });
});

describe('image generation parameter drafts', () => {
  const generateMode = resolveImageGenerationMode(support, false);

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

describe('placeholder tile sizing', () => {
  it('prefers an explicit ratio, then a pixel size, and squares off when neither is set', () => {
    expect(imageParamsAspectRatio({ aspectRatio: '16:9' })).toBeCloseTo(16 / 9);
    expect(imageParamsAspectRatio({ size: '1024x768' })).toBeCloseTo(4 / 3);
    expect(imageParamsAspectRatio({ imageResolution: '512X1024' })).toBeCloseTo(0.5);
    // Ratio wins: `size` may be the provider's own pixel spelling of it.
    expect(imageParamsAspectRatio({ aspectRatio: '1:2', size: '1024x1024' })).toBeCloseTo(0.5);
    expect(imageParamsAspectRatio(undefined)).toBe(1);
    expect(imageParamsAspectRatio({})).toBe(1);
  });

  it('formats the best available resolution for loading copy', () => {
    expect(imageParamsResolutionLabel({ size: '1024x768' })).toBe('1024 \u00d7 768');
    expect(imageParamsResolutionLabel({ imageResolution: '2K' })).toBe('2K');
    expect(imageParamsResolutionLabel({ resolution: '512X1024' })).toBe('512 \u00d7 1024');
    expect(imageParamsResolutionLabel({ imageResolution: '2K', size: 'auto' })).toBe('2K');
    expect(imageParamsResolutionLabel({ size: 'auto' })).toBeUndefined();
    expect(imageParamsResolutionLabel(undefined)).toBeUndefined();
  });

  it('falls back to square rather than trusting junk from the ledger', () => {
    expect(imageParamsAspectRatio({ aspectRatio: 'auto' })).toBe(1);
    expect(imageParamsAspectRatio({ size: '0x1024' })).toBe(1);
    expect(imageParamsAspectRatio({ size: '1024' })).toBe(1);
  });
});

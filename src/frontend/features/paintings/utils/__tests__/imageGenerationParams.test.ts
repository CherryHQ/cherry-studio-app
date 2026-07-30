import type { ImageGenerationSupport } from '@cherrystudio/provider-registry';

import {
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

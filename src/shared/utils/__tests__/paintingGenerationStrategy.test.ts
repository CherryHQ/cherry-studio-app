import type { ImageGenerationSupport } from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';

import { MAX_IMAGE_ATTACHMENT_COUNT } from '../fileAttachmentPolicy';
import { createPaintingGenerationStrategy } from '../paintingGenerationStrategy';

const image = { fileEntryId: 'image-1', name: 'image.png', mediaType: 'image/png', size: 100 };
const generate = {
  supports: {
    numImages: { type: 'range' as const, min: 1, max: 4 },
    seed: { type: 'text' as const },
  },
};
const edit = { supports: {}, maxInputImages: 1 };
function model(imageGeneration: ImageGenerationSupport): Model {
  return {
    id: 'provider::image',
    providerId: 'provider',
    modelId: 'image',
    name: 'Image',
    capabilities: ['image-generation'],
    isEnabled: true,
    isHidden: false,
    supportsStreaming: false,
    inputModalities: ['text'],
    imageGeneration,
  };
}

describe('painting generation strategy', () => {
  it('keeps generate-only models usable after an output and never admits that output as a reference', () => {
    const strategy = createPaintingGenerationStrategy(model({ modes: { generate } }));
    expect(strategy.kind).toBe('generate-only');
    expect(strategy.canReference(image)).toBe(false);
    expect(strategy.prepare({ images: [], prompt: 'Next image', paramValues: {} })).toMatchObject({
      mode: 'generate',
    });
    expect(() => strategy.prepare({ images: [image], prompt: 'Edit', paramValues: {} })).toThrow(
      'images-unsupported',
    );
  });

  it('routes reference-capable generate models without inventing an edit endpoint', () => {
    const strategy = createPaintingGenerationStrategy(
      model({ modes: { generate: { ...generate, maxInputImages: 2 } } }),
    );
    expect(strategy.canReference(image)).toBe(true);
    expect(strategy.prepare({ images: [image], prompt: 'Blue', paramValues: {} }).mode).toBe(
      'generate',
    );
    expect(() =>
      strategy.prepare({ images: [image], mode: 'edit', prompt: 'Blue', paramValues: {} }),
    ).toThrow('mode-changed');
  });

  it('requires an image but permits an empty prompt for image-only operations', () => {
    const strategy = createPaintingGenerationStrategy(
      model({ modes: { edit: { ...edit, requirePrompt: false } } }),
    );
    expect(strategy.inputIssue(0)).toEqual({ code: 'image-required' });
    expect(strategy.prepare({ images: [image], prompt: '', paramValues: {} })).toMatchObject({
      mode: 'edit',
      prompt: '',
    });
  });

  it('deduplicates the same file but rejects distinct images above the model limit', () => {
    const strategy = createPaintingGenerationStrategy(model({ modes: { generate, edit } }));
    expect(strategy.prepare({ images: [image, image], prompt: 'Blue', paramValues: {} }).mode).toBe(
      'edit',
    );
    expect(() =>
      strategy.prepare({
        images: [image, { ...image, fileEntryId: 'image-2' }],
        prompt: 'Blue',
        paramValues: {},
      }),
    ).toThrow('too-many-images');
    const unbounded = createPaintingGenerationStrategy(
      model({ modes: { edit: { supports: {} } } }),
    );
    expect(unbounded.maxInputImages).toBe(MAX_IMAGE_ATTACHMENT_COUNT);
  });

  it('refuses stale, unsupported and invalid parameters instead of silently dropping them', () => {
    const strategy = createPaintingGenerationStrategy(model({ modes: { generate, edit } }));
    for (const paramValues of [
      { numImages: 10 },
      { quality: 'high' },
      { quality: '' },
      { seed: 1.5 },
    ]) {
      expect(() => strategy.prepare({ images: [], prompt: 'Draw', paramValues })).toThrow(
        'invalid-parameters',
      );
    }
    expect(() =>
      strategy.prepare({ images: [image], prompt: 'Edit', paramValues: { numImages: 2 } }),
    ).toThrow('invalid-parameters');
  });

  it('validates serialized custom sizes against the selected mode', () => {
    const strategy = createPaintingGenerationStrategy(
      model({
        modes: {
          generate: {
            supports: {
              size: { type: 'enum', options: ['auto', '1024x1024'] },
              customSize: { type: 'size', pairedEnumKey: 'size', minSide: 512, maxSide: 2048 },
            },
          },
        },
      }),
    );
    expect(
      strategy.prepare({ images: [], prompt: 'Draw', paramValues: { size: '1024x768' } })
        .paramValues,
    ).toEqual({ size: '1024x768' });
    expect(() =>
      strategy.prepare({ images: [], prompt: 'Draw', paramValues: { size: '100x768' } }),
    ).toThrow('invalid-parameters');
  });

  it('does not automatically use missing or oversized image facts', () => {
    const strategy = createPaintingGenerationStrategy(model({ modes: { generate, edit } }));
    expect(strategy.canReference({ ...image, mediaType: 'application/pdf' })).toBe(false);
    expect(strategy.canReference({ ...image, size: 100 * 1024 * 1024 })).toBe(false);
    expect(createPaintingGenerationStrategy(undefined).inputIssue(0)).toEqual({
      code: 'model-unavailable',
    });
    expect(
      createPaintingGenerationStrategy({
        ...model({ modes: { generate } }),
        isEnabled: false,
      }).inputIssue(0),
    ).toEqual({ code: 'model-unavailable' });
  });
});

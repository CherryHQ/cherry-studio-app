import { normalizeAspectRatio, splitImageParamValues } from '../imageOptions';

describe('image AI SDK option routing', () => {
  it('normalizes Registry aspect-ratio spellings', () => {
    expect(normalizeAspectRatio('ASPECT_16_9')).toBe('16:9');
    expect(normalizeAspectRatio('4:3')).toBe('4:3');
    expect(normalizeAspectRatio('wide')).toBeUndefined();
  });

  it('splits native fields from provider-specific fields and drops blanks', () => {
    expect(
      splitImageParamValues({
        aspectRatio: 'ASPECT_16_9',
        negativePrompt: 'blur',
        numImages: 3,
        outputFormat: '',
        seed: 42,
        size: '1024x1024',
      }),
    ).toEqual({
      structured: {
        aspectRatio: '16:9',
        n: 3,
        seed: 42,
        size: '1024x1024',
      },
      vendorBag: { negativePrompt: 'blur' },
    });
  });

  it('drops an invalid native aspect ratio instead of forwarding it as vendor data', () => {
    expect(splitImageParamValues({ aspectRatio: 'wide' })).toEqual({
      structured: {},
      vendorBag: {},
    });
  });
});

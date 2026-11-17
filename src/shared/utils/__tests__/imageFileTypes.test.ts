import {
  AI_SUPPORTED_IMAGE_MEDIA_TYPES,
  generatedImageExtension,
  imageMediaTypeFromExtension,
  imageMediaTypeFromHeader,
  isAiSupportedImageMediaType,
  isImageFileExtension,
} from '../imageFileTypes';

describe('image file types', () => {
  it.each([
    ['avif', 'image/avif'],
    ['gif', 'image/gif'],
    ['heic', 'image/heic'],
    ['heif', 'image/heif'],
    ['jpeg', 'image/jpeg'],
    ['jpg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ])('maps the %s extension to %s', (extension, mediaType) => {
    expect(isImageFileExtension(extension)).toBe(true);
    expect(imageMediaTypeFromExtension(extension)).toBe(mediaType);
  });

  it('uses preferred output extensions and safe fallbacks', () => {
    expect(generatedImageExtension('image/jpeg')).toBe('jpg');
    expect(generatedImageExtension('image/heic')).toBe('heic');
    expect(generatedImageExtension('unknown')).toBe('png');
    expect(isImageFileExtension('pdf')).toBe(false);
    expect(imageMediaTypeFromExtension(null)).toBe('image/*');
  });

  it.each([
    ['89504e470d0a1a0a', 'image/png'],
    ['ffd8ff', 'image/jpeg'],
    ['474946383761', 'image/gif'],
    ['474946383961', 'image/gif'],
    ['524946460000000057454250', 'image/webp'],
    ['424d', 'image/bmp'],
    ['49492a00', 'image/tiff'],
    ['4d4d002a', 'image/tiff'],
    ['000000186674797061766966000000006d69663161766966', 'image/avif'],
    ['00000018667479706d696631000000006d69663161766966', 'image/avif'],
    ['000000146674797068656963000000006d696631', 'image/heic'],
    ['00000014667479706d696631000000006d696631', 'image/heif'],
  ])('identifies %s as %s without using a filename', (hex, mediaType) => {
    const bytes = Uint8Array.from(hex.match(/../g)!, (byte) => Number.parseInt(byte, 16));
    // Native reads may expose a view into a larger buffer.
    const padded = new Uint8Array(bytes.length + 2);
    padded.set(bytes, 1);
    expect(imageMediaTypeFromHeader(padded.subarray(1, bytes.length + 1))).toBe(mediaType);
  });

  it.each([
    '',
    '89504e470d0a1a',
    '524946460000000057415645',
    '00000014667479706d703432000000006d703432',
  ])('does not infer an image type from an unknown or truncated header %s', (hex) => {
    const bytes = Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
    expect(imageMediaTypeFromHeader(bytes)).toBeUndefined();
  });

  it('recognizes only model-supported image media types', () => {
    expect(AI_SUPPORTED_IMAGE_MEDIA_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ]);
    expect(isAiSupportedImageMediaType('IMAGE/JPEG')).toBe(true);
    expect(isAiSupportedImageMediaType('image/heic')).toBe(false);
    expect(isAiSupportedImageMediaType('image/*')).toBe(false);
  });
});

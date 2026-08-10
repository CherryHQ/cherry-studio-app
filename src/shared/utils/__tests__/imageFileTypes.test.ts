import {
  generatedImageExtension,
  imageMediaTypeFromExtension,
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
});

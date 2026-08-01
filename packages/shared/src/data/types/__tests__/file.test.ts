import {
  generatedImageExtension,
  imageMediaTypeFromExtension,
  isImageFileExtension,
} from '../file';

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

  it('uses the preferred output extension for generated images', () => {
    expect(generatedImageExtension('image/jpeg')).toBe('jpg');
    expect(generatedImageExtension('image/heic')).toBe('heic');
    expect(generatedImageExtension('unknown')).toBe('png');
  });

  it('falls back for unknown and missing extensions', () => {
    expect(isImageFileExtension('pdf')).toBe(false);
    expect(imageMediaTypeFromExtension('pdf')).toBe('image/*');
    expect(imageMediaTypeFromExtension(null)).toBe('image/*');
  });
});

import {
  AI_IMAGE_INPUT_MAX_COUNT,
  AI_SUPPORTED_IMAGE_MEDIA_TYPES,
  generatedImageExtension,
  imageMediaTypeFromExtension,
  isAiSupportedImageMediaType,
  isImageFileExtension,
  isSvgMediaType,
  resolveImageImportMediaType,
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
    ['svg', 'image/svg+xml'],
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

  it('recognizes only model-supported image media types', () => {
    expect(AI_IMAGE_INPUT_MAX_COUNT).toBe(9);
    expect(AI_SUPPORTED_IMAGE_MEDIA_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ]);
    expect(isAiSupportedImageMediaType('IMAGE/JPEG')).toBe(true);
    expect(isAiSupportedImageMediaType('image/heic')).toBe(false);
    expect(isAiSupportedImageMediaType('image/svg+xml')).toBe(false);
    expect(isAiSupportedImageMediaType('image/*')).toBe(false);
  });

  it('recognizes SVG for preview and infers its type only during import', () => {
    expect(isSvgMediaType('IMAGE/SVG+XML; charset=utf-8')).toBe(true);
    expect(resolveImageImportMediaType('diagram.SVG', 'application/octet-stream')).toBe(
      'image/svg+xml',
    );
    expect(resolveImageImportMediaType('diagram.svg')).toBe('image/svg+xml');
    expect(resolveImageImportMediaType('diagram.svg', 'text/plain')).toBe('text/plain');
  });
});

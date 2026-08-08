import { resolveFilePreviewKind as resolveAndroidPreview } from '../filePreviewRegistry.android';
import { resolveFilePreviewKind as resolveIosPreview } from '../filePreviewRegistry.ios';

describe('FilePreview registry', () => {
  test.each(['png', 'JPG', 'jpeg', 'gif', 'webp', 'heic', 'heif', 'avif'])(
    'registers %s as an image on both platforms',
    (extension) => {
      expect(resolveIosPreview(extension)).toBe('image');
      expect(resolveAndroidPreview(extension)).toBe('image');
    },
  );

  test.each(['pdf', 'PPTX', 'docx', 'txt', null])(
    'uses the platform document fallback for %s',
    (extension) => {
      expect(resolveIosPreview(extension)).toBe('quick-look');
      expect(resolveAndroidPreview(extension)).toBe('fallback');
    },
  );
});

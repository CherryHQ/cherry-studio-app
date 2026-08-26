import { FallbackPreview } from '../components/fallback-preview';
import { ImagePreview } from '../components/image-preview';
import { QuickLookPreview } from '../components/quick-look-preview.ios';
import * as android from '../default-plugins/default-plugins.android';
import * as ios from '../default-plugins/default-plugins.ios';

jest.mock('../components/fallback-preview', () => ({
  FallbackPreview: () => null,
  FilePreviewUnavailable: () => null,
}));
jest.mock('../components/image-preview', () => ({ ImagePreview: () => null }));
jest.mock('../components/quick-look-preview.ios', () => ({ QuickLookPreview: () => null }));

describe('default file preview plugins', () => {
  it('renders images the same way on both platforms', () => {
    expect(ios.defaultFilePreviewPlugins).toEqual([{ component: ImagePreview, kind: 'image' }]);
    expect(android.defaultFilePreviewPlugins).toEqual([{ component: ImagePreview, kind: 'image' }]);
  });

  it('falls back to the system thumbnail on iOS and the extension card on Android', () => {
    expect(ios.defaultFilePreviewFallback).toBe(QuickLookPreview);
    expect(android.defaultFilePreviewFallback).toBe(FallbackPreview);
  });
});

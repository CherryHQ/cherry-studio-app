import { documentPreviewNavigationAction } from '../documentPreviewNavigation';

describe('documentPreviewNavigationAction', () => {
  it('keeps the preview page and its anchors', () => {
    expect(documentPreviewNavigationAction('https://file-preview.local/')).toBe('allow');
    expect(documentPreviewNavigationAction('https://file-preview.local/#page=2')).toBe('allow');
    // Android reports the base URL without its trailing slash.
    expect(documentPreviewNavigationAction('https://file-preview.local')).toBe('allow');
    expect(documentPreviewNavigationAction('about:blank')).toBe('allow');
  });

  it('sends web links out and blocks everything else', () => {
    expect(documentPreviewNavigationAction('https://example.com/')).toBe('external');
    expect(documentPreviewNavigationAction('https://file-preview.local/other')).toBe('block');
    expect(documentPreviewNavigationAction('https://file-preview.local/?q=1')).toBe('block');
    expect(documentPreviewNavigationAction('https://example.com/', false)).toBe('block');
    expect(documentPreviewNavigationAction('file:///etc/passwd')).toBe('block');
    expect(documentPreviewNavigationAction('tel:123')).toBe('block');
  });
});

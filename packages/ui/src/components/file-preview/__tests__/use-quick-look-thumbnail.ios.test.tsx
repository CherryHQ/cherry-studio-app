import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { FilePreviewFile, FilePreviewOperation } from '../file-preview.types';
import { useQuickLookThumbnail } from '../hooks/use-quick-look-thumbnail.ios';

const mockGetQuickLookThumbnail = jest.fn();

jest.mock('../utils/quick-look-thumbnail-cache.ios', () => ({
  getQuickLookThumbnail: (input: unknown) => mockGetQuickLookThumbnail(input),
  quickLookThumbnailCacheKey: () => 'thumbnail-key',
}));

const file: FilePreviewFile = {
  displayName: 'brief.pdf',
  extensionLabel: 'PDF',
  id: 'file-1',
  kind: 'document',
  revision: 42,
  uri: 'file:///documents/brief.pdf',
};

function Probe({ onError }: { onError: (error: Error, operation: FilePreviewOperation) => void }) {
  useQuickLookThumbnail({ file, height: 112, onError, width: 112 });
  return null;
}

describe('useQuickLookThumbnail', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  it('reports thumbnail generation errors through the operation contract', async () => {
    const error = new Error('thumbnail failed');
    const onError = jest.fn();
    mockGetQuickLookThumbnail.mockRejectedValue(error);

    await act(async () => {
      renderer = create(<Probe onError={onError} />);
      await Promise.resolve();
    });

    expect(onError).toHaveBeenCalledWith(error, 'thumbnail');
  });
});

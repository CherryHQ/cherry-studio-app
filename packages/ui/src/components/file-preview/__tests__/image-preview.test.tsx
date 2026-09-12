import { act, create } from 'react-test-renderer';

import { ImagePreview } from '../components/image-preview';
import type { FilePreviewFile } from '../file-preview.types';

const mockImage = jest.fn((_props: unknown) => null);

jest.mock('../../image', () => ({
  Image: (props: unknown) => mockImage(props),
}));

describe('ImagePreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the small preview while preserving the original file URI elsewhere', () => {
    const file: FilePreviewFile = {
      displayName: 'photo.jpg',
      extensionLabel: 'JPG',
      id: 'file-1',
      kind: 'image',
      previewUri: 'file:///cache/photo.webp',
      revision: 42,
      uri: 'file:///documents/photo.jpg',
    };

    act(() => {
      create(<ImagePreview file={file} />);
    });

    expect(mockImage).toHaveBeenCalledWith(
      expect.objectContaining({
        recyclingKey: 'file-1:42',
        source: 'file:///cache/photo.webp',
      }),
    );
  });

  it('falls back to the original URI when no preview is available', () => {
    const file: FilePreviewFile = {
      displayName: 'photo.jpg',
      extensionLabel: 'JPG',
      id: 'file-1',
      kind: 'image',
      revision: 42,
      uri: 'file:///documents/photo.jpg',
    };

    act(() => {
      create(<ImagePreview file={file} />);
    });

    expect(mockImage).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'file:///documents/photo.jpg' }),
    );
  });
});

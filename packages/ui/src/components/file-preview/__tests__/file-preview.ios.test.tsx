import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FilePreview } from '../components/file-preview/file-preview.ios';
import type { FilePreviewFile } from '../file-preview.types';

const mockPreviewFile = jest.fn();

jest.mock('@magrinj/expo-quick-look', () => ({
  __esModule: true,
  default: { previewFile: (input: unknown) => mockPreviewFile(input) },
}));
jest.mock('../components/file-preview-frame', () => {
  const React = jest.requireActual('react');
  return { FilePreviewFrame: (props: object) => React.createElement('FilePreviewFrame', props) };
});
jest.mock('../components/image-preview', () => {
  const React = jest.requireActual('react');
  return { ImagePreview: (props: object) => React.createElement('ImagePreview', props) };
});
jest.mock('../components/quick-look-preview.ios', () => {
  const React = jest.requireActual('react');
  return { QuickLookPreview: (props: object) => React.createElement('QuickLookPreview', props) };
});
jest.mock('../components/fallback-preview', () => ({
  FallbackPreview: () => null,
  FilePreviewLoading: () => null,
  FilePreviewUnavailable: () => null,
}));

const labels = { loading: 'Loading', openWith: 'Open with', unavailable: 'Unavailable' };

describe('FilePreview.ios', () => {
  beforeEach(() => {
    mockPreviewFile.mockReset();
    mockPreviewFile.mockResolvedValue(undefined);
  });

  it('renders images directly and documents with Quick Look thumbnails', () => {
    const imageRenderer = render(<FilePreview file={file('image')} labels={labels} />);
    expect(imageRenderer.root.findAllByType('ImagePreview')).toHaveLength(1);

    const documentRenderer = render(<FilePreview file={file('document')} labels={labels} />);
    expect(documentRenderer.root.findAllByType('QuickLookPreview')).toHaveLength(1);
  });

  it('opens the file with editing disabled and reports failures', async () => {
    const error = new Error('open failed');
    const onError = jest.fn();
    mockPreviewFile.mockRejectedValue(error);
    const renderer = render(
      <FilePreview file={file('document')} labels={labels} onError={onError} />,
    );

    await act(async () => renderer.root.findByType('FilePreviewFrame').props.onPress());

    expect(mockPreviewFile).toHaveBeenCalledWith({
      editingMode: 'disabled',
      uri: 'file:///documents/brief.pdf',
    });
    expect(onError).toHaveBeenCalledWith(error, 'open');
  });
});

function file(kind: FilePreviewFile['kind']): FilePreviewFile {
  return {
    displayName: 'brief.pdf',
    extensionLabel: 'PDF',
    id: 'file-1',
    kind,
    revision: 42,
    uri: 'file:///documents/brief.pdf',
  };
}

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) {
    throw new Error('Renderer was not created');
  }
  return renderer;
}

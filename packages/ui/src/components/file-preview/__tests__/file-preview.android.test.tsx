import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FilePreview } from '../components/file-preview/file-preview.android';
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
jest.mock('../components/fallback-preview', () => {
  const React = jest.requireActual('react');
  return {
    FallbackPreview: (props: object) => React.createElement('FallbackPreview', props),
    FilePreviewUnavailable: (props: object) => React.createElement('FilePreviewUnavailable', props),
  };
});

const labels = { openWith: 'Open with', unavailable: 'Unavailable' };

describe('FilePreview.android', () => {
  beforeEach(() => {
    mockPreviewFile.mockReset();
    mockPreviewFile.mockResolvedValue(undefined);
  });

  it('renders images directly and documents with the generic fallback', () => {
    const imageRenderer = render(<FilePreview file={file('image')} labels={labels} />);
    expect(imageRenderer.root.findAllByType('ImagePreview')).toHaveLength(1);

    const documentRenderer = render(<FilePreview file={file('document')} labels={labels} />);
    expect(documentRenderer.root.findAllByType('FallbackPreview')).toHaveLength(1);
  });

  it('opens files with the localized chooser label', async () => {
    const renderer = render(<FilePreview file={file('document')} labels={labels} />);

    await act(async () => renderer.root.findByType('FilePreviewFrame').props.onPress());

    expect(mockPreviewFile).toHaveBeenCalledWith({
      chooserTitle: 'Open with',
      uri: 'file:///documents/brief.pdf',
    });
  });

  it('disables unavailable files', () => {
    const unavailableRenderer = render(<FilePreview labels={labels} />);
    expect(unavailableRenderer.root.findAllByType('FilePreviewUnavailable')).toHaveLength(1);
    expect(unavailableRenderer.root.findByType('FilePreviewFrame').props.disabled).toBe(true);
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

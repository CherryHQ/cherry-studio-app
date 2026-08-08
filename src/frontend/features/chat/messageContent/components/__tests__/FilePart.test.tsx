import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FilePart } from '../FilePart';

const mockPreviewFile = jest.fn(async (_input: unknown) => undefined);
const mockUseFilePartUri = jest.fn();

jest.mock('@magrinj/expo-quick-look', () => ({
  __esModule: true,
  default: { previewFile: (input: unknown) => mockPreviewFile(input) },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { name?: string }) =>
      key === 'chat.media.fileUnavailable' ? `${values?.name} unavailable` : 'Unavailable',
  }),
}));

jest.mock('../../hooks/useFilePartUri', () => ({
  useFilePartUri: (part: unknown) => mockUseFilePartUri(part),
}));

jest.mock('@/frontend/components/mediaTile', () => {
  const { createElement } = jest.requireActual('react');
  return {
    FileTile: (props: object) => createElement('FileTile', props),
    ImageTile: (props: object) => createElement('ImageTile', props),
  };
});

describe('FilePart', () => {
  beforeEach(() => {
    mockPreviewFile.mockClear();
    mockUseFilePartUri.mockReset();
  });

  test('renders and previews an image with the resolved URI', async () => {
    mockUseFilePartUri.mockReturnValue({
      isLoading: false,
      uri: 'file:///new-sandbox/files/image.png',
    });
    const renderer = render(<FilePart part={filePart('image/png')} />);
    const imageTile = renderer.root.findByType('ImageTile');

    await act(async () => imageTile.props.onPress());

    expect(imageTile.props.uri).toBe('file:///new-sandbox/files/image.png');
    expect(mockPreviewFile).toHaveBeenCalledWith({
      editingMode: 'disabled',
      uri: 'file:///new-sandbox/files/image.png',
    });
  });

  test('previews a non-image file with the same resolved URI', async () => {
    mockUseFilePartUri.mockReturnValue({
      isLoading: false,
      uri: 'file:///new-sandbox/files/brief.pdf',
    });
    const renderer = render(<FilePart part={filePart('application/pdf')} />);
    const fileTile = renderer.root.findByType('FileTile');

    await act(async () => fileTile.props.onPress());

    expect(mockPreviewFile).toHaveBeenCalledWith({
      editingMode: 'disabled',
      uri: 'file:///new-sandbox/files/brief.pdf',
    });
  });

  test('renders a disabled unavailable tile without mounting an image', () => {
    mockUseFilePartUri.mockReturnValue({ isLoading: false, uri: undefined });
    const renderer = render(<FilePart part={filePart('image/png')} />);
    const fileTile = renderer.root.findByType('FileTile');

    expect(renderer.root.findAllByType('ImageTile')).toHaveLength(0);
    expect(fileTile.props).toEqual(
      expect.objectContaining({
        accessibilityLabel: 'brief.pdf unavailable',
        accessibilityState: { disabled: true },
        onPress: undefined,
        statusLabel: 'Unavailable',
      }),
    );
  });
});

function render(element: ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) {
    throw new Error('Renderer was not created');
  }
  return renderer;
}

function filePart(mediaType: string): Extract<CherryMessagePart, { type: 'file' }> {
  return {
    filename: 'brief.pdf',
    mediaType,
    type: 'file',
    url: 'file:///old-sandbox/brief.pdf',
  };
}

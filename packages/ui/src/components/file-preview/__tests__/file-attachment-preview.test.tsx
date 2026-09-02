import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FileAttachmentPreview } from '../components/file-attachment-preview';
import type { FilePreviewFile } from '../file-preview.types';

const mockOpenFilePreview = jest.fn();

jest.mock('../utils/open-file/open-file', () => ({
  openFilePreview: (input: unknown) => mockOpenFilePreview(input),
}));

const file: FilePreviewFile = {
  displayName: 'release-notes.md',
  extensionLabel: 'MD',
  id: 'file-1',
  kind: 'text',
  revision: 1,
  uri: 'file:///documents/release-notes.md',
};
const labels = { openWith: 'Open with', unavailable: 'Unavailable' };

describe('FileAttachmentPreview', () => {
  beforeEach(() => {
    mockOpenFilePreview.mockReset();
    mockOpenFilePreview.mockResolvedValue(undefined);
  });

  it('shows the filename stem and document metadata', () => {
    const renderer = render(
      <FileAttachmentPreview categoryLabel="Document" file={file} labels={labels} />,
    );
    const text = renderer.root.findAllByType('Text').flatMap((node) => node.props.children);

    expect(text).toEqual(['release-notes', 'Document · MD']);
  });

  it('opens the original file and reports failures', async () => {
    const error = new Error('open failed');
    const onError = jest.fn();
    mockOpenFilePreview.mockRejectedValue(error);
    const renderer = render(
      <FileAttachmentPreview
        categoryLabel="Document"
        file={file}
        labels={labels}
        onError={onError}
      />,
    );

    const pressable = renderer.root.findByProps({ accessibilityRole: 'button' });
    await act(async () => pressable.props.onPress());

    expect(mockOpenFilePreview).toHaveBeenCalledWith({ file, labels });
    expect(onError).toHaveBeenCalledWith(error, 'open');
  });

  it('renders a disabled unavailable state without opening', () => {
    const renderer = render(<FileAttachmentPreview categoryLabel="Document" labels={labels} />);
    const pressable = renderer.root.findByProps({ accessibilityRole: 'button' });

    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.accessibilityLabel).toBe('Unavailable');
  });
});

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  if (!renderer) throw new Error('Renderer was not created');
  return renderer;
}

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FileAttachmentPreview } from '../components/file-attachment-preview';
import type { FilePreviewFile } from '../file-preview.types';

const onPress = jest.fn();

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
    onPress.mockReset();
  });

  it('shows the filename stem and document metadata', () => {
    const renderer = render(
      <FileAttachmentPreview
        categoryLabel="Document"
        file={file}
        labels={labels}
        onPress={onPress}
      />,
    );
    const text = renderer.root.findAllByType('Text').flatMap((node) => node.props.children);

    expect(text).toEqual(['release-notes', 'Document · MD']);
  });

  it('delegates a valid press to the caller', () => {
    const renderer = render(
      <FileAttachmentPreview
        categoryLabel="Document"
        file={file}
        labels={labels}
        onPress={onPress}
      />,
    );
    const pressable = renderer.root.findByProps({ accessibilityRole: 'button' });
    act(() => pressable.props.onPress());

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders a disabled unavailable state without opening', () => {
    const renderer = render(
      <FileAttachmentPreview categoryLabel="Document" labels={labels} onPress={onPress} />,
    );
    const pressable = renderer.root.findByProps({ accessibilityRole: 'button' });

    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.accessibilityLabel).toBe('Unavailable');
    act(() => pressable.props.onPress());
    expect(onPress).not.toHaveBeenCalled();
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

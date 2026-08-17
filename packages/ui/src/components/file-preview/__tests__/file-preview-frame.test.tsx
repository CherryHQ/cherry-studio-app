import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FilePreviewFrame } from '../components/file-preview-frame';

describe('FilePreviewFrame', () => {
  it('clips previews to continuous rounded corners', () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(
        <FilePreviewFrame accessibilityLabel="Attachment" onPress={jest.fn()} size={112}>
          <></>
        </FilePreviewFrame>,
      );
    });

    expect(renderer?.toJSON()).toMatchObject({
      props: {
        style: {
          borderCurve: 'continuous',
          borderRadius: 16,
          height: 112,
          overflow: 'hidden',
          width: 112,
        },
      },
    });
  });
});

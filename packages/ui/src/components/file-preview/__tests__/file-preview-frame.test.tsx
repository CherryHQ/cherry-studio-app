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
        className: expect.stringContaining('rounded-2xl'),
        style: {
          borderCurve: 'continuous',
          height: 112,
          overflow: 'hidden',
          width: 112,
        },
      },
    });
  });
});

import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FilePreviewFrame } from '../components/file-preview-frame';

describe('FilePreviewFrame', () => {
  test.each([
    ['default', undefined, 112, 'rounded-2xl'],
    ['library card', 'card', 160, 'rounded-4xl'],
  ] as const)(
    'clips %s preview content at the shared corner boundary',
    (_, variant, size, cornerClassName) => {
      let renderer: ReactTestRenderer | undefined;

      act(() => {
        renderer = create(
          <FilePreviewFrame
            accessibilityLabel="Attachment"
            onPress={jest.fn()}
            size={size}
            variant={variant}
          >
            <></>
          </FilePreviewFrame>,
        );
      });

      expect(renderer?.toJSON()).toMatchObject({
        props: {
          style: {
            height: size,
            width: size,
          },
        },
      });

      const clippingView = renderer?.root
        .findAllByType(View)
        .find((node) => node.props.className?.includes('overflow-hidden'));
      expect(clippingView?.props).toMatchObject({
        className: `size-full overflow-hidden ${cornerClassName}`,
        style: { borderCurve: 'continuous' },
      });
    },
  );
});

import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FilePreviewFrame } from '../components/file-preview-frame';

jest.mock('uniwind', () => ({
  useResolveClassNames: (className: string) => ({
    borderRadius: className === 'rounded-4xl' ? 26 : 18,
  }),
}));

describe('FilePreviewFrame', () => {
  test.each([
    ['default', undefined, 112, 18],
    ['library card', 'card', 160, 26],
  ] as const)(
    'clips %s previews to the resolved continuous corners',
    (_, variant, size, radius) => {
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
            borderCurve: 'continuous',
            borderRadius: radius,
            height: size,
            overflow: 'hidden',
            width: size,
          },
        },
      });
    },
  );
});

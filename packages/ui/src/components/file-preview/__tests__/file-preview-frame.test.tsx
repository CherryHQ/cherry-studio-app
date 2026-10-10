import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('uniwind', () => ({
  ...jest.requireActual('uniwind'),
  useCSSVariable: () => ['#2288aa', '#cc3344'],
}));

import { FilePreviewFrame } from '../components/file-preview-frame';

it('announces acknowledged upload progress and removes the busy state when the file is ready', () => {
  let renderer: ReactTestRenderer;
  const props = { accessibilityLabel: 'report.pdf', onPress: jest.fn(), size: 112 };
  act(() => {
    renderer = create(
      <FilePreviewFrame
        {...props}
        transfer={{ state: 'uploading', progress: 0.25, label: 'Uploading 25%' }}
      >
        {null}
      </FilePreviewFrame>,
    );
  });
  expect(
    renderer!.root.findByProps({ accessibilityRole: 'progressbar' }).props.accessibilityValue,
  ).toEqual({ min: 0, max: 100, now: 25 });
  expect(
    renderer!.root.findAllByProps({ accessibilityRole: 'button' })[0].props.accessibilityState.busy,
  ).toBe(true);
  act(() => {
    renderer!.update(<FilePreviewFrame {...props}>{null}</FilePreviewFrame>);
  });
  expect(renderer!.root.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0);
  expect(
    renderer!.root.findAllByProps({ accessibilityRole: 'button' })[0].props.accessibilityState.busy,
  ).toBe(false);
  act(() => renderer!.unmount());
});

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

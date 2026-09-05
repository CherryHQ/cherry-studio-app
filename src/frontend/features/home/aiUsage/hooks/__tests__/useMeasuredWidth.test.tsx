import { type ReactElement } from 'react';
import { Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useMeasuredWidth } from '../useMeasuredWidth';

jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  const actual = jest.requireActual('react-native');
  const MockView = React.forwardRef(function MockView(
    props: Record<string, unknown>,
    ref: React.Ref<unknown>,
  ) {
    return React.createElement('MeasuredView', { ...props, ref });
  });

  return Object.defineProperty(Object.create(actual), 'View', { value: MockView });
});

describe('useMeasuredWidth', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
  });

  it('measures in the layout effect before waiting for onLayout updates', async () => {
    await act(async () => {
      const createWithNodeMock = create as unknown as (
        element: ReactElement,
        options: { createNodeMock: (element: ReactElement) => unknown },
      ) => ReactTestRenderer;
      renderer = createWithNodeMock(<MeasuredWidth />, {
        createNodeMock: (element: ReactElement) =>
          (element.props as { testID?: string }).testID === 'measured-view'
            ? { getBoundingClientRect: () => ({ width: 321 }) }
            : null,
      });
    });

    expect(renderer?.root.findByProps({ testID: 'measured-width' }).props.children).toBe(321);

    await act(async () =>
      renderer?.root.findByProps({ testID: 'measured-view' }).props.onLayout({
        nativeEvent: { layout: { width: 400 } },
      }),
    );
    expect(renderer?.root.findByProps({ testID: 'measured-width' }).props.children).toBe(400);
  });
});

function MeasuredWidth() {
  const { onLayout, ref, width } = useMeasuredWidth();

  return (
    <View ref={ref} testID="measured-view" onLayout={onLayout}>
      <Text testID="measured-width">{width}</Text>
    </View>
  );
}

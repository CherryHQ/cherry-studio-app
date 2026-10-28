import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { type FoldRegionLayout, FoldRegionObserver } from '../index';

let mockNativeProps: {
  onLayoutChange: (event: { nativeEvent: FoldRegionLayout }) => void;
};

jest.mock('expo', () => ({
  requireOptionalNativeModule: () => ({}),
  requireNativeView: () =>
    function MockNativeFoldRegion(props: typeof mockNativeProps) {
      mockNativeProps = props;
      return null;
    },
}));

it('delivers the host, safe area, window and fold in one snapshot, including unfolded windows', () => {
  const onLayoutChange = jest.fn();
  const layout: FoldRegionLayout = {
    host: { height: 669, width: 951, x: 0, y: 0 },
    insets: { left: 0, right: 24 },
    window: { height: 669, width: 951 },
    fold: { height: 669, isActive: true, width: 40, x: 455, y: 0 },
  };
  act(() => {
    create(createElement(FoldRegionObserver!, { onLayoutChange }));
  });

  act(() => mockNativeProps.onLayoutChange({ nativeEvent: layout }));
  act(() => mockNativeProps.onLayoutChange({ nativeEvent: { ...layout, fold: null } }));

  expect(onLayoutChange.mock.calls).toEqual([[layout], [{ ...layout, fold: null }]]);
});

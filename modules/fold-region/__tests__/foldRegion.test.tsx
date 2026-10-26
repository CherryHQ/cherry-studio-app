import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { type FoldRegion, FoldRegionObserver } from '../index';

let mockNativeProps: {
  onFoldChange: (event: { nativeEvent: { fold: FoldRegion | null } }) => void;
};

jest.mock('expo', () => ({
  requireOptionalNativeModule: () => ({}),
  requireNativeView: () =>
    function MockNativeFoldRegion(props: typeof mockNativeProps) {
      mockNativeProps = props;
      return null;
    },
}));

it('hands callers the bare fold rather than the synthetic event', () => {
  const onFoldChange = jest.fn();
  const fold = { height: 669, isActive: true, width: 40, x: 455, y: 0 };
  act(() => {
    create(createElement(FoldRegionObserver!, { onFoldChange }));
  });

  act(() => mockNativeProps.onFoldChange({ nativeEvent: { fold } }));
  act(() => mockNativeProps.onFoldChange({ nativeEvent: { fold: null } }));

  expect(onFoldChange.mock.calls).toEqual([[fold], [null]]);
});

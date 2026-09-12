import { StyleSheet, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SurfaceFrame } from '../surface-frame.android';

describe('SurfaceFrame.android', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('renders the complete fallback style without glass dependencies', () => {
    act(() => {
      renderer = create(
        <SurfaceFrame
          className="bg-card rounded-2xl"
          cornerRadius={16}
          style={{ height: 48 }}
          testID="surface-frame"
        />,
      );
    });

    const frame = renderer!.root.findByType(View);

    expect(frame.props.className).toBe('bg-card rounded-2xl');
    expect(StyleSheet.flatten(frame.props.style)).toEqual({
      borderRadius: 16,
      height: 48,
      overflow: 'hidden',
    });
  });
});

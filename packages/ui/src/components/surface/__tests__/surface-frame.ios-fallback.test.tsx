import { StyleSheet, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SurfaceFrame } from '../surface-frame.ios';

jest.mock('expo-glass-effect', () => ({
  GlassView: () => {
    throw new Error('GlassView must not render when Liquid Glass is unavailable.');
  },
  isGlassEffectAPIAvailable: () => false,
  isLiquidGlassAvailable: () => false,
}));

describe('SurfaceFrame.ios fallback', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('preserves the fallback token, shape, and caller geometry', () => {
    act(() => {
      renderer = create(
        <SurfaceFrame
          className="bg-sidebar-accent rounded-full"
          cornerRadius={9999}
          style={{ height: 44, width: 44 }}
          testID="surface-frame"
          tintColor="#123456"
        />,
      );
    });

    const frame = renderer!.root.findByType(View);

    expect(frame.props.className).toBe('bg-sidebar-accent rounded-full');
    expect(StyleSheet.flatten(frame.props.style)).toEqual({
      borderRadius: 9999,
      height: 44,
      overflow: 'hidden',
      width: 44,
    });
  });
});

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SurfaceFrame } from '../surface-frame.ios';

jest.mock('expo-glass-effect', () => ({
  GlassView: ({ children, ...props }: { children?: ReactNode }) => {
    const React = jest.requireActual('react');
    const { View: MockView } = jest.requireActual('react-native');

    return React.createElement(MockView, { ...props, testID: 'glass-view' }, children);
  },
  isGlassEffectAPIAvailable: () => true,
  isLiquidGlassAvailable: () => true,
}));

describe('SurfaceFrame.ios', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('renders interactive tinted glass with shared geometry', () => {
    act(() => {
      renderer = create(
        <SurfaceFrame
          className="bg-card"
          cornerRadius={20}
          interactive
          style={{ height: 40 }}
          tintColor="#123456"
        >
          <View testID="content" />
        </SurfaceFrame>,
      );
    });

    const glass = renderer!.root.findByProps({ testID: 'glass-view' });

    expect(glass.props).toMatchObject({
      glassEffectStyle: 'regular',
      isInteractive: true,
      tintColor: '#123456',
    });
    expect(StyleSheet.flatten(glass.props.style)).toEqual({
      borderRadius: 20,
      height: 40,
      overflow: 'hidden',
    });
    expect(renderer!.root.findByProps({ testID: 'content' })).toBeDefined();
  });
});

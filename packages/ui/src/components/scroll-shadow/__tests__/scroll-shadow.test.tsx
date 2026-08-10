import { ScrollView, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ScrollShadow } from '../scroll-shadow';

jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));

jest.mock('heroui-native/scroll-shadow', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ScrollShadow: React.forwardRef(
      ({ children, ...props }: { children: React.ReactNode }, ref: unknown) => (
        <MockView {...props} ref={ref} testID="hero-scroll-shadow">
          {children}
        </MockView>
      ),
    ),
  };
});

describe('ScrollShadow', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('provides the gradient implementation and forwards scroll shadow props', () => {
    act(() => {
      renderer = create(
        <ScrollShadow size={80} visibility="bottom">
          <ScrollView testID="content" />
        </ScrollShadow>,
      );
    });

    const shadow = renderer?.root.findByProps({ testID: 'hero-scroll-shadow' });

    expect(typeof shadow?.props.LinearGradientComponent).toBe('function');
    expect(shadow?.props.size).toBe(80);
    expect(shadow?.props.visibility).toBe('bottom');
    expect(renderer?.root.findByProps({ testID: 'content' })).toBeDefined();
    expect(renderer?.root.findAllByType(View)).not.toHaveLength(0);
  });
});

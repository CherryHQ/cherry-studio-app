import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Spinner } from '../spinner';

jest.mock('heroui-native/spinner', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');

  return {
    Spinner: React.forwardRef((props: object, ref: unknown) => (
      <MockView {...props} ref={ref} testID="hero-spinner" />
    )),
  };
});

describe('Spinner', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it.each([
    ['sm', 'sm'],
    ['default', 'md'],
    ['lg', 'lg'],
  ] as const)('maps the %s size to HeroUI %s', (size, expectedSize) => {
    act(() => {
      renderer = create(<Spinner accessibilityLabel="Loading" size={size} />);
    });

    const spinner = renderer?.root.findByProps({ testID: 'hero-spinner' });

    expect(spinner?.props.accessibilityLabel).toBe('Loading');
    expect(spinner?.props.size).toBe(expectedSize);
    expect(renderer?.root.findAllByType(View)).not.toHaveLength(0);
  });

  it('forwards a custom color', () => {
    act(() => {
      renderer = create(<Spinner color="#ffffff" />);
    });

    expect(renderer?.root.findByProps({ testID: 'hero-spinner' }).props.color).toBe('#ffffff');
  });
});

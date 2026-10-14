import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SliderControl } from '../slider-control.ios';

jest.mock('@expo/ui/swift-ui', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    Host: (props: object) => React.createElement(View, { ...props, mockComponent: 'host' }),
    Slider: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'expo-slider' }),
  };
});

jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: (label: string) => ({ accessibilityLabel: label }),
  disabled: (disabled: boolean) => ({ disabled }),
}));

jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: 'dark' }),
}));

describe('SliderControl (iOS)', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders a controlled SwiftUI slider with native accessibility', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <SliderControl
          accessibilityLabel="Volume"
          onValueChange={onValueChange}
          testID="volume"
          value={40}
        />,
      );
    });

    const host = renderer!.root.findByProps({ mockComponent: 'host' });
    const slider = renderer!.root.findByProps({ mockComponent: 'expo-slider' });

    expect(host.props).toMatchObject({
      colorScheme: 'dark',
      ignoreSafeArea: 'all',
      matchContents: { vertical: true },
    });
    expect(slider.props).toMatchObject({
      max: 100,
      min: 0,
      step: 1,
      testID: 'volume',
      value: 40,
    });
    expect(slider.props.modifiers).toEqual([{ accessibilityLabel: 'Volume' }, { disabled: false }]);

    act(() => slider.props.onValueChange(45));
    expect(onValueChange).toHaveBeenCalledWith(45);
  });

  test('maps custom bounds and disabled state to SwiftUI', () => {
    act(() => {
      renderer = create(
        <SliderControl
          accessibilityLabel="Opacity"
          disabled
          max={1}
          min={0.1}
          onValueChange={jest.fn()}
          step={0.1}
          value={0.5}
        />,
      );
    });

    const slider = renderer!.root.findByProps({ mockComponent: 'expo-slider' });

    expect(slider.props).toMatchObject({ max: 1, min: 0.1, step: 0.1, value: 0.5 });
    expect(slider.props.modifiers).toContainEqual({ disabled: true });
  });
});

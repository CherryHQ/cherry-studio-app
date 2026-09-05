import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SliderControl } from '../slider-control.android';

jest.mock('@react-native-community/slider', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'native-slider' }),
  };
});

describe('SliderControl (Android)', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders a controlled native Android slider with accessibility', () => {
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

    const slider = renderer!.root.findByProps({ mockComponent: 'native-slider' });

    expect(slider.props).toMatchObject({
      accessibilityLabel: 'Volume',
      accessibilityRole: 'adjustable',
      accessibilityValue: { max: 100, min: 0, now: 40 },
      disabled: false,
      maximumValue: 100,
      minimumValue: 0,
      step: 1,
      testID: 'volume',
      value: 40,
    });

    act(() => slider.props.onValueChange(45));
    expect(onValueChange).toHaveBeenCalledWith(45);
  });

  test('maps custom bounds and disabled state to the native control', () => {
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

    expect(renderer!.root.findByProps({ mockComponent: 'native-slider' }).props).toMatchObject({
      disabled: true,
      maximumValue: 1,
      minimumValue: 0.1,
      step: 0.1,
      value: 0.5,
    });
  });
});

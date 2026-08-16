import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Slider } from '../slider.ios';

jest.mock('@expo/ui/swift-ui', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Host: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'host', testID: 'host' }),
    Slider: (props: object) =>
      React.createElement(View, { ...props, mockComponent: 'expo-slider' }),
    Text: (props: object) => React.createElement(View, { ...props, mockComponent: 'expo-text' }),
  };
});

jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: (label: string) => ({ accessibilityLabel: label }),
  disabled: (disabled: boolean) => ({ disabled }),
}));

jest.mock('uniwind', () => ({
  useUniwind: () => ({ theme: 'dark' }),
}));

describe('Slider (iOS)', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders the Expo UI slider inside its Host with default values', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <Slider accessibilityLabel="Volume" onValueChange={onValueChange} value={40} />,
      );
    });

    const host = renderer!.root.findByProps({ testID: 'host' });
    const slider = renderer!.root.findByProps({ mockComponent: 'expo-slider' });

    expect(host.props.colorScheme).toBe('dark');
    expect(host.props.matchContents).toEqual({ vertical: true });
    expect(host.props.style).toEqual([{ alignSelf: 'stretch' }, undefined]);
    expect(slider.props.min).toBe(0);
    expect(slider.props.max).toBe(100);
    expect(slider.props.step).toBe(1);
    expect(slider.props.modifiers).toEqual([{ accessibilityLabel: 'Volume' }, { disabled: false }]);

    act(() => slider.props.onValueChange(45));
    expect(onValueChange).toHaveBeenCalledWith(45);
  });

  test('maps custom bounds, endpoint labels, and disabled state', () => {
    act(() => {
      renderer = create(
        <Slider
          accessibilityLabel="Opacity"
          disabled
          max={1}
          maximumValueLabel="Maximum"
          min={0.1}
          minimumValueLabel="Minimum"
          onValueChange={jest.fn()}
          step={0.1}
          value={0.5}
        />,
      );
    });

    const slider = renderer!.root.findByProps({ mockComponent: 'expo-slider' });

    expect(slider.props.min).toBe(0.1);
    expect(slider.props.max).toBe(1);
    expect(slider.props.maximumValueLabel.props.children).toBe('Maximum');
    expect(slider.props.step).toBe(0.1);
    expect(slider.props.minimumValueLabel.props.children).toBe('Minimum');
    expect(slider.props.modifiers).toContainEqual({ disabled: true });
  });
});

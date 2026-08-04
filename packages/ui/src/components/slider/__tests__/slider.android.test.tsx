import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Slider } from '../slider.android';

jest.mock('heroui-native', () => {
  const React = require('react');
  const { View } = require('react-native');

  function Root(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-slider' });
  }

  Root.Track = (props: object) => React.createElement(View, { ...props, testID: 'track' });
  Root.Fill = (props: object) => React.createElement(View, { ...props, testID: 'fill' });
  Root.Thumb = (props: object) => React.createElement(View, { ...props, testID: 'thumb' });

  return { Slider: Root };
});

describe('Slider (Android)', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders the default HeroUI slider anatomy and maps value changes', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <Slider accessibilityLabel="Volume" onValueChange={onValueChange} value={40} />,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'hero-slider' });

    expect(root.props.isDisabled).toBe(false);
    expect(root.props.minValue).toBe(0);
    expect(root.props.maxValue).toBe(100);
    expect(root.props.step).toBe(1);
    expect(renderer!.root.findByProps({ testID: 'track' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'fill' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'thumb' })).toBeDefined();

    act(() => root.props.onChange(45));
    expect(onValueChange).toHaveBeenCalledWith(45);
  });

  test('forwards custom bounds, disabled state, style, and testID', () => {
    const style = { marginTop: 8 };

    act(() => {
      renderer = create(
        <Slider
          accessibilityLabel="Opacity"
          disabled
          max={1}
          min={0.1}
          onValueChange={jest.fn()}
          step={0.1}
          style={style}
          testID="opacity-slider"
          value={0.5}
        />,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'hero-slider' });

    expect(root.props.isDisabled).toBe(true);
    expect(root.props.minValue).toBe(0.1);
    expect(root.props.maxValue).toBe(1);
    expect(root.props.step).toBe(0.1);
    expect(root.props.style).toBe(style);
  });
});

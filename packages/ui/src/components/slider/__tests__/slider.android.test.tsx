import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Slider } from '../slider.android';

jest.mock('heroui-native', () => {
  const React = require('react');
  const { View } = require('react-native');

  function Root(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-slider' });
  }

  Root.Track = function SliderTrack(props: object) {
    return React.createElement(View, { ...props, testID: 'track' });
  };
  Root.Fill = function SliderFill(props: object) {
    return React.createElement(View, { ...props, testID: 'fill' });
  };
  Root.Thumb = function SliderThumb(props: object) {
    return React.createElement(View, { ...props, testID: 'thumb' });
  };

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
    expect(root.props.accessibilityLabel).toBeUndefined();
    expect(renderer!.root.findByProps({ testID: 'track' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'fill' })).toBeDefined();
    const thumb = renderer!.root.findByProps({ testID: 'thumb' });
    expect(thumb.props.accessibilityLabel).toBe('Volume');
    expect(thumb.props.accessibilityActions).toEqual([
      { name: 'decrement' },
      { name: 'increment' },
    ]);

    act(() => root.props.onChange(45));
    expect(onValueChange).toHaveBeenCalledWith(45);

    act(() => thumb.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    act(() => thumb.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(onValueChange).toHaveBeenNthCalledWith(2, 41);
    expect(onValueChange).toHaveBeenNthCalledWith(3, 39);
  });

  test('maps custom bounds and disabled state to HeroUI', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <Slider
          accessibilityLabel="Opacity"
          disabled
          max={1}
          min={0.1}
          onValueChange={onValueChange}
          step={0.1}
          value={0.5}
        />,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'hero-slider' });

    expect(root.props.isDisabled).toBe(true);
    expect(root.props.minValue).toBe(0.1);
    expect(root.props.maxValue).toBe(1);
    expect(root.props.step).toBe(0.1);

    const thumb = renderer!.root.findByProps({ testID: 'thumb' });
    expect(thumb.props.accessibilityActions).toBeUndefined();
    expect(thumb.props.onAccessibilityAction).toBeUndefined();
    expect(onValueChange).not.toHaveBeenCalled();
  });

  test('renders endpoint labels around a flexible slider', () => {
    const style = { marginTop: 8 };

    act(() => {
      renderer = create(
        <Slider
          accessibilityLabel="Text size"
          maximumValueLabel="Extra large"
          minimumValueLabel="Standard"
          onValueChange={jest.fn()}
          style={style}
          value={1}
        />,
      );
    });

    const root = renderer!.root.findByProps({ mockComponent: 'hero-slider' });
    const labels = renderer!.root.findAllByType(Text);

    expect(root.props.className).toBe('min-w-0 flex-1');
    expect(root.props.style).toBeUndefined();
    expect(labels.map((label) => label.props.children)).toEqual(['Standard', 'Extra large']);
    expect(labels.every((label) => label.props.allowFontScaling !== false)).toBe(true);
  });
});

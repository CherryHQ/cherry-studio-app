import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Slider } from '../slider';

jest.mock('heroui-native', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

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

describe('Slider', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('renders the shared anatomy and maps scalar and array value changes', () => {
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
    expect(renderer!.root.findByProps({ testID: 'thumb' }).props).toMatchObject({
      accessibilityActions: [{ name: 'decrement' }, { name: 'increment' }],
      accessibilityLabel: 'Volume',
    });

    act(() => root.props.onChange(45));
    act(() => root.props.onChange([48]));
    expect(onValueChange).toHaveBeenNthCalledWith(1, 45);
    expect(onValueChange).toHaveBeenNthCalledWith(2, 48);
  });

  test('steps through accessibility actions without floating-point drift', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <Slider
          accessibilityLabel="Opacity"
          max={1}
          min={0}
          onValueChange={onValueChange}
          step={0.1}
          value={0.3}
        />,
      );
    });

    const thumb = renderer!.root.findByProps({ testID: 'thumb' });

    act(() => thumb.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    act(() => thumb.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    act(() => thumb.props.onAccessibilityAction({ nativeEvent: { actionName: 'escape' } }));

    expect(onValueChange).toHaveBeenNthCalledWith(1, 0.4);
    expect(onValueChange).toHaveBeenNthCalledWith(2, 0.2);
    expect(onValueChange).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['increment', 1],
    ['decrement', 0],
  ] as const)('clamps %s actions at the range boundary', (actionName, value) => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <Slider
          accessibilityLabel="Opacity"
          max={1}
          min={0}
          onValueChange={onValueChange}
          step={0.1}
          value={value}
        />,
      );
    });

    act(() =>
      renderer!.root
        .findByProps({ testID: 'thumb' })
        .props.onAccessibilityAction({ nativeEvent: { actionName } }),
    );

    expect(onValueChange).not.toHaveBeenCalled();
  });

  test('maps custom bounds and disabled state to the shared control', () => {
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

    expect(root.props).toMatchObject({
      isDisabled: true,
      maxValue: 1,
      minValue: 0.1,
      step: 0.1,
    });
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

import { Pressable } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Switch } from '../switch';

jest.mock('heroui-native', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  function Switch(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-switch' });
  }

  Switch.Thumb = function SwitchThumb(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-switch-thumb' });
  };

  return { Switch };
});

describe('Switch', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('maps the shared API to the Cherry visual control', () => {
    const onValueChange = jest.fn();
    const style = { opacity: 0.8 };

    act(() => {
      renderer = create(
        <Switch
          accessibilityLabel="Airplane mode"
          onValueChange={onValueChange}
          style={style}
          testID="airplane-mode"
          value
        />,
      );
    });

    const control = renderer!.root.findByProps({ mockComponent: 'hero-switch' });
    const thumb = renderer!.root.findByProps({ mockComponent: 'hero-switch-thumb' });

    expect(control.props).toMatchObject({
      accessibilityLabel: 'Airplane mode',
      className: 'h-6 w-12',
      hitSlop: 8,
      isDisabled: false,
      isSelected: true,
      style,
      testID: 'airplane-mode',
    });
    expect(thumb.props.className).toBe('h-5 w-7');

    act(() => control.props.onSelectedChange(false));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  test.each([
    { root: 'h-5 w-10', size: 'sm', thumb: 'h-4 w-6' },
    { root: 'h-6 w-12', size: 'default', thumb: 'h-5 w-7' },
    { root: 'h-7 w-14', size: 'lg', thumb: 'h-6 w-8' },
  ] as const)('renders the $size size', ({ root, size, thumb }) => {
    act(() => {
      renderer = create(
        <Switch accessibilityLabel="Airplane mode" onValueChange={jest.fn()} size={size} value />,
      );
    });

    expect(renderer!.root.findByProps({ mockComponent: 'hero-switch' }).props.className).toBe(root);
    expect(renderer!.root.findByProps({ mockComponent: 'hero-switch-thumb' }).props.className).toBe(
      thumb,
    );
  });

  test('maps disabled state to the visual control', () => {
    act(() => {
      renderer = create(
        <Switch
          accessibilityLabel="Airplane mode"
          disabled
          onValueChange={jest.fn()}
          value={false}
        />,
      );
    });

    const control = renderer!.root.findByProps({ mockComponent: 'hero-switch' });

    expect(control.props.isDisabled).toBe(true);
  });

  test('owns the press without activating an ancestor press target', () => {
    const onValueChange = jest.fn();
    const stopPropagation = jest.fn();

    act(() => {
      renderer = create(
        <Switch accessibilityLabel="Airplane mode" onValueChange={onValueChange} value />,
      );
    });

    const pressOwner = renderer!.root.findByType(Pressable);

    expect(pressOwner.props.accessible).toBe(false);
    expect(pressOwner.props.hitSlop).toBe(8);

    act(() => pressOwner.props.onPress({ stopPropagation }));

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onValueChange).not.toHaveBeenCalled();

    act(() =>
      renderer!.root.findByProps({ mockComponent: 'hero-switch' }).props.onSelectedChange(false),
    );
    expect(onValueChange).toHaveBeenCalledWith(false);
  });
});

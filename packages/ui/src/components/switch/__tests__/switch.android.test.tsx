import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Switch } from '../switch.android';

jest.mock('heroui-native', () => {
  const React = require('react');
  const { View } = require('react-native');

  function Switch(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-switch' });
  }

  Switch.Thumb = function SwitchThumb(props: object) {
    return React.createElement(View, { ...props, mockComponent: 'hero-switch-thumb' });
  };

  return { Switch };
});

describe('Switch (Android)', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('maps the shared API to the default HeroUI Switch', () => {
    const onValueChange = jest.fn();

    act(() => {
      renderer = create(
        <Switch accessibilityLabel="Airplane mode" onValueChange={onValueChange} value />,
      );
    });

    const control = renderer!.root.findByProps({ mockComponent: 'hero-switch' });
    const thumb = renderer!.root.findByProps({ mockComponent: 'hero-switch-thumb' });

    expect(control.props.accessibilityLabel).toBe('Airplane mode');
    expect(control.props.className).toBe('h-6 w-12');
    expect(control.props.hitSlop).toBe(8);
    expect(control.props.isDisabled).toBe(false);
    expect(control.props.isSelected).toBe(true);
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

  test('maps disabled state to HeroUI', () => {
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
});

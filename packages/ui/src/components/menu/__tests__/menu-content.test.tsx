import { BackHandler } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MenuContent } from '../menu-content';

const mockOpenChange = jest.fn();
const mockClosed = jest.fn();
const anchor = { height: 48, pageX: 16, pageY: 120, width: 200 };

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { bezier: () => 'bezier' },
    interpolate: (value: number, _input: number[], output: number[]) =>
      output[0] + (output[1] - output[0]) * value,
    runOnJS: (fn: unknown) => fn,
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => false,
    useSharedValue: (initial: number) => {
      const ref = React.useRef({
        value: initial,
        set(next: number) {
          this.value = next;
        },
      });
      return ref.current;
    },
    withTiming: (value: number) => value,
  };
});

jest.mock('heroui-native/utils', () => {
  const { twMerge } = jest.requireActual('tailwind-merge');
  return { cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')) };
});

jest.mock('../../portal', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const component = (props: object) => React.createElement(View, props);

  return {
    Portal: component,
  };
});

jest.mock('../menu-panel', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    MenuPanel: (props: object) => React.createElement(View, props),
    menuRowClassName: '',
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 24, left: 0, right: 0, top: 24 }),
}));

jest.mock('@cherrystudio/app-icons/icons/check', () => () => null);
jest.mock('@cherrystudio/app-icons/icons/git-fork', () => () => null);

describe('MenuContent', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => mockOpenChange.mockReset());

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  it('closes before invoking the selected action, including when it throws', () => {
    const order: string[] = [];
    mockOpenChange.mockImplementation(() => order.push('close'));
    const onPress = jest.fn(() => {
      order.push('action');
      throw new Error('Action failed');
    });

    act(() => {
      renderer = create(
        <MenuContent
          anchor={anchor}
          isOpen
          onClose={mockOpenChange}
          onClosed={mockClosed}
          items={[{ destructive: true, id: 'delete', label: 'Delete', onPress }]}
        />,
      );
    });

    expect(() =>
      renderer!.root.findByProps({ accessibilityLabel: 'Delete' }).props.onPress(),
    ).toThrow('Action failed');
    expect(order).toEqual(['close', 'action']);
    expect(mockOpenChange).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('never dispatches a disabled action or dismisses for it', () => {
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <MenuContent
          anchor={anchor}
          isOpen
          onClose={mockOpenChange}
          onClosed={mockClosed}
          items={[{ disabled: true, id: 'delete', label: 'Delete', onPress }]}
        />,
      );
    });

    const item = renderer!.root.findByProps({ accessibilityLabel: 'Delete' });
    expect(item.props.disabled).toBe(true);
    act(() => item.props.onPress());
    expect(onPress).not.toHaveBeenCalled();
    expect(mockOpenChange).not.toHaveBeenCalled();
  });

  it('keeps check state controlled by the caller and exposes it to accessibility', () => {
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <MenuContent
          anchor={anchor}
          isOpen
          onClose={mockOpenChange}
          onClosed={mockClosed}
          items={[{ checked: true, id: 'pin', label: 'Pin', onPress }]}
        />,
      );
    });

    const item = renderer!.root.findByProps({ accessibilityLabel: 'Pin' });
    expect(item.props).toMatchObject({
      accessibilityLabel: 'Pin',
      accessibilityRole: 'checkbox',
      accessibilityState: { checked: true, disabled: false },
    });
    act(() => item.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(item.props.accessibilityState.checked).toBe(true);
  });

  it('dismisses on Android back and releases the subscription when closing', () => {
    const remove = jest.fn();
    const subscribe = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove });
    const items = [{ id: 'rename', label: 'Rename', onPress: jest.fn() }];
    act(() => {
      renderer = create(
        <MenuContent
          anchor={anchor}
          isOpen
          items={items}
          onClose={mockOpenChange}
          onClosed={mockClosed}
        />,
      );
    });
    const handler = subscribe.mock.calls[0][1];
    act(() => expect(handler({ type: 'hardwareBackPress', timeStamp: Date.now() })).toBe(true));
    expect(mockOpenChange).toHaveBeenCalledTimes(1);
    act(() =>
      renderer!.update(
        <MenuContent
          anchor={anchor}
          isOpen={false}
          items={items}
          onClose={mockOpenChange}
          onClosed={mockClosed}
        />,
      ),
    );
    expect(remove).toHaveBeenCalledTimes(1);
    const backdrop = renderer!.root.find(
      (node) => node.props.accessibilityElementsHidden && typeof node.props.onPress === 'function',
    );
    expect(backdrop.props.pointerEvents).toBe('none');
    act(() => renderer!.root.findByProps({ accessibilityLabel: 'Rename' }).props.onPress());
    expect(items[0].onPress).not.toHaveBeenCalled();
  });
});

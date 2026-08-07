import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Composer } from '../composer';
import type { ComposerAttachment, ComposerProps } from '../composer.types';

jest.mock('heroui-native/utils', () => {
  const { twMerge } = require('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('uniwind', () => ({
  useResolveClassNames: jest.fn(() => ({ color: '#8e8e93' })),
}));

// `Composer.Menu` reaches for the portal, and heroui ships ESM that jest's
// transform whitelist does not cover. A plain host is enough here — the menu's
// own suite is where the portal behavior is pinned.
jest.mock('heroui-native/portal', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    Portal: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

// Harmless when Metro/jest resolves the Android surface instead: mocking a
// module nothing imports is a no-op.
jest.mock('expo-glass-effect', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    GlassView: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(View, { ...props, testID: 'glass-view' }, children),
    isGlassEffectAPIAvailable: () => false,
    isLiquidGlassAvailable: () => false,
  };
});

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View },
    // `bezier` and the interpolation helpers are `Composer.Menu`'s, which the
    // root pulls in even when nothing renders a menu.
    Easing: { bezier: () => 'bezier', ease: 'ease', inOut: (easing: unknown) => easing },
    interpolate: (value: number, _input: number[], output: number[]) =>
      output[0]! + (output[1]! - output[0]!) * value,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => false,
    useSharedValue: (initial: number) => ({
      set(next: number) {
        this.value = next;
      },
      value: initial,
    }),
    withTiming: jest.fn((value: number) => value),
  };
});

const attachments: ComposerAttachment[] = [
  { id: 'a', name: 'Sunrise', uri: 'file:///a.jpg' },
  { id: 'b', name: 'Harbor', uri: 'file:///b.jpg' },
];

describe('Composer', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  function render(props: Partial<ComposerProps> = {}) {
    act(() => {
      renderer = create(
        <Composer
          onChangeText={jest.fn()}
          onSend={jest.fn()}
          testID="composer"
          value=""
          {...props}
        />,
      );
    });

    return renderer!;
  }

  // A testID matches both the component that declares it and the `Pressable` it
  // renders; the innermost one carries what a tap actually hits.
  function press(tree: ReactTestRenderer, testID: string) {
    const matches = tree.root
      .findAllByProps({ testID })
      .filter((node) => typeof node.props.onPress === 'function');
    const button = matches[matches.length - 1]!;

    act(() => {
      button.props.onPress();
    });

    return button;
  }

  function pressSend(tree: ReactTestRenderer) {
    return press(tree, 'composer-send');
  }

  it('blocks the send action until there is text or an attachment', () => {
    const onSend = jest.fn();
    const tree = render({ onSend });
    const button = pressSend(tree);

    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('treats whitespace-only text as empty', () => {
    const onSend = jest.fn();

    pressSend(render({ onSend, value: '   \n ' }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends on text alone', () => {
    const onSend = jest.fn();

    pressSend(render({ onSend, value: 'Hello' }));

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('sends on attachments alone', () => {
    const onSend = jest.fn();

    pressSend(render({ attachments, onSend }));

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('stops instead of sending while streaming', () => {
    const onSend = jest.fn();
    const onStop = jest.fn();
    const tree = render({ onSend, onStop, streaming: true, value: 'Hello' });
    const button = pressSend(tree);

    expect(button.props.accessibilityLabel).toBe('Stop generating');
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('falls back to sending when streaming without a stop handler', () => {
    const onSend = jest.fn();
    const button = pressSend(render({ onSend, streaming: true, value: 'Hello' }));

    expect(button.props.accessibilityLabel).toBe('Send message');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('keeps the thumbnails mounted after the attachments clear so the strip can collapse', () => {
    const tree = render({ attachments, value: '' });

    expect(tree.root.findAllByProps({ accessibilityLabel: 'Sunrise' }).length).toBeGreaterThan(0);

    act(() => {
      tree.update(
        <Composer
          attachments={[]}
          onChangeText={jest.fn()}
          onSend={jest.fn()}
          testID="composer"
          value=""
        />,
      );
    });

    expect(tree.root.findAllByProps({ accessibilityLabel: 'Sunrise' }).length).toBeGreaterThan(0);
  });

  it('removes an attachment by id', () => {
    const onAttachmentRemove = jest.fn();
    const tree = render({ attachments, onAttachmentRemove });
    const [removeButton] = tree.root.findAllByProps({ accessibilityLabel: 'Remove attachment' });

    act(() => {
      removeButton.props.onPress();
    });

    expect(onAttachmentRemove).toHaveBeenCalledWith('a');
  });

  it('omits the remove badge when no remove handler is supplied', () => {
    const tree = render({ attachments });

    expect(tree.root.findAllByProps({ accessibilityLabel: 'Remove attachment' })).toHaveLength(0);
  });

  it('defers sendability to the caller when canSend is supplied', () => {
    const onSend = jest.fn();

    // An image model that has not been picked yet: there is a prompt, but the
    // composer cannot know that sending would fail.
    pressSend(render({ canSend: false, onSend, value: 'A cat wearing a hat' }));

    expect(onSend).not.toHaveBeenCalled();

    // …and the inverse: a mode that needs no prompt at all.
    pressSend(render({ canSend: true, onSend, value: '' }));

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('hands the whole layout over to children, sending included', () => {
    const onSend = jest.fn();
    const tree = render({
      children: (
        <Composer.Toolbar>
          <Composer.Action accessibilityLabel="Attach" testID="custom-tool">
            <View />
          </Composer.Action>
        </Composer.Toolbar>
      ),
      onSend,
      value: 'Hello',
    });

    expect(tree.root.findAllByProps({ testID: 'custom-tool' }).length).toBeGreaterThan(0);
    // Nothing is mandatory: no text field, no send button, no complaint.
    expect(tree.root.findAllByProps({ testID: 'composer-send' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'composer-input' })).toHaveLength(0);
  });

  it('runs a custom tool action', () => {
    const onPress = jest.fn();
    const tree = render({
      children: (
        <Composer.Toolbar>
          <Composer.Action accessibilityLabel="Attach" onPress={onPress} testID="custom-tool">
            <View />
          </Composer.Action>
        </Composer.Toolbar>
      ),
    });

    const button = press(tree, 'custom-tool');

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.props.accessibilityLabel).toBe('Attach');
  });

  it('rejects a part rendered outside a composer', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() =>
      act(() => {
        create(<Composer.Send />);
      }),
    ).toThrow('Composer.Send must be rendered inside a Composer');

    consoleError.mockRestore();
  });
});

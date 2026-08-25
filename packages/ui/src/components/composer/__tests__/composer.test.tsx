import { createRef } from 'react';
import { Text, TextInput, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { Composer } from '../components/composer';
import type { ComposerInputHandle, ComposerProps } from '../composer.types';

jest.mock('heroui-native/utils', () => {
  const { twMerge } = require('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
});

jest.mock('uniwind', () => ({
  useResolveClassNames: jest.fn((className: string) =>
    className.includes('text-foreground')
      ? { color: '#111827', fontSize: 16 }
      : { color: '#8e8e93' },
  ),
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

  it('blocks the send action until there is text', () => {
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

  it('defers sendability to the caller when canSend is supplied', () => {
    const onSend = jest.fn();

    // An image model that has not been picked yet: there is a prompt, but the
    // composer cannot know that sending would fail.
    pressSend(render({ canSend: false, onSend, value: 'A cat wearing a hat' }));

    expect(onSend).not.toHaveBeenCalled();

    // …and the inverse: an attachment the caller holds, or a mode that needs no
    // prompt at all.
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

  it('hands pastes to the caller unfiltered', () => {
    const onPaste = jest.fn();
    const tree = render({
      children: <Composer.Input onPaste={onPaste} testID="composer-input" />,
    });
    const wrapper = tree.root.find((node) => typeof node.props.onPaste === 'function');

    act(() => {
      wrapper.props.onPaste({ type: 'images', uris: ['file:///pasted.jpg'] });
    });

    // Including the kinds the composer has no use for: only the caller knows
    // whether a pasted file is an attachment or something to ignore.
    act(() => {
      wrapper.props.onPaste({ type: 'unsupported' });
    });

    expect(onPaste).toHaveBeenNthCalledWith(1, {
      type: 'images',
      uris: ['file:///pasted.jpg'],
    });
    expect(onPaste).toHaveBeenNthCalledWith(2, { type: 'unsupported' });
  });

  it('resolves the base typography for the native rich-text field', () => {
    const tree = render({
      children: <Composer.Input testID="composer-input" />,
    });
    const input = tree.root.findByType(TextInput);

    expect(input.props.style).toEqual(expect.objectContaining({ color: '#111827', fontSize: 16 }));
  });

  // The field owns its own buffer, so a caller-side value has to be pushed into
  // it. Send clearing the draft is the case this exists for.
  it('pushes a value the caller changed into the field', () => {
    const inputRef = createRef<ComposerInputHandle>();
    const onChangeText = jest.fn();
    const onSend = jest.fn();
    const children = <Composer.Input ref={inputRef} testID="composer-input" />;
    const tree = render({ children, onChangeText, onSend, value: 'draw a cat' });

    act(() => {
      tree.update(
        <Composer onChangeText={onChangeText} onSend={onSend} value="">
          {children}
        </Composer>,
      );
    });

    expect(inputRef.current?.setValue).toHaveBeenCalledWith('');
    expect(tree.root.findByType(TextInput).props.value).toBe('');
  });

  // Round-tripping a keystroke would put the caret back where the field had
  // just moved it away from, which is what makes typing unusable.
  it('does not push a value that came from the field itself', () => {
    const inputRef = createRef<ComposerInputHandle>();
    const onSend = jest.fn();
    let value = '';
    const onChangeText = jest.fn((next: string) => {
      value = next;
    });
    const children = <Composer.Input ref={inputRef} testID="composer-input" />;
    const tree = render({ children, onChangeText, onSend, value });

    act(() => {
      tree.root.findByType(TextInput).props.onChangeText('draw');
    });
    act(() => {
      tree.update(
        <Composer onChangeText={onChangeText} onSend={onSend} value={value}>
          {children}
        </Composer>,
      );
    });

    expect(onChangeText).toHaveBeenCalledWith('draw');
    expect(inputRef.current?.setValue).not.toHaveBeenCalled();
  });

  it('carries an icon and a label in a pill without letting the icon shrink', () => {
    const onPress = jest.fn();
    const tree = render({
      children: (
        <Composer.Toolbar>
          <Composer.Pill
            accessibilityLabel="Change model"
            icon={<View testID="pill-icon" />}
            onPress={onPress}
            testID="model-pill"
          >
            <Text testID="pill-label">Claude Opus</Text>
          </Composer.Pill>
        </Composer.Toolbar>
      ),
    });

    const icon = tree.root.findByProps({ testID: 'pill-icon' });

    expect(tree.root.findByProps({ testID: 'pill-label' }).props.children).toBe('Claude Opus');
    // The pill gives up width before the toolbar does, so the icon has to be
    // held out of that: a long model name must squeeze the text, not the logo.
    expect(icon.parent?.props.className).toContain('shrink-0');
    expect(press(tree, 'model-pill').props.accessibilityLabel).toBe('Change model');
    expect(onPress).toHaveBeenCalledTimes(1);
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

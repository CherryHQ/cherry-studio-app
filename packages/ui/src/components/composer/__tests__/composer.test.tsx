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
    Easing: { ease: 'ease', inOut: (easing: unknown) => easing },
    useAnimatedStyle: (factory: () => object) => factory(),
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
  function pressPrimaryAction(tree: ReactTestRenderer) {
    const matches = tree.root
      .findAllByProps({ testID: 'composer-primary-action' })
      .filter((node) => typeof node.props.onPress === 'function');
    const button = matches[matches.length - 1]!;

    act(() => {
      button.props.onPress();
    });

    return button;
  }

  it('blocks the send action until there is text or an attachment', () => {
    const onSend = jest.fn();
    const tree = render({ onSend });
    const button = pressPrimaryAction(tree);

    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('treats whitespace-only text as empty', () => {
    const onSend = jest.fn();

    pressPrimaryAction(render({ onSend, value: '   \n ' }));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends on text alone', () => {
    const onSend = jest.fn();

    pressPrimaryAction(render({ onSend, value: 'Hello' }));

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('sends on attachments alone', () => {
    const onSend = jest.fn();

    pressPrimaryAction(render({ attachments, onSend }));

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('stops instead of sending while streaming', () => {
    const onSend = jest.fn();
    const onStop = jest.fn();
    const tree = render({ onSend, onStop, streaming: true, value: 'Hello' });
    const button = pressPrimaryAction(tree);

    expect(button.props.accessibilityLabel).toBe('Stop generating');
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('falls back to sending when streaming without a stop handler', () => {
    const onSend = jest.fn();
    const button = pressPrimaryAction(render({ onSend, streaming: true, value: 'Hello' }));

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

  it('renders a custom leading slot instead of the built-in add button', () => {
    const tree = render({ leading: <View testID="custom-leading" /> });

    expect(tree.root.findAllByProps({ testID: 'composer-leading' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: 'custom-leading' }).length).toBeGreaterThan(0);
  });

  it('drops the leading slot entirely when it is explicitly null', () => {
    const tree = render({ leading: null });

    expect(tree.root.findAllByProps({ testID: 'composer-leading' })).toHaveLength(0);
    expect(tree.root.findAllByProps({ accessibilityLabel: 'Add attachment' })).toHaveLength(0);
  });
});

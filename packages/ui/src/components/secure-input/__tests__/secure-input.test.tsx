import { StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { SecureInput } from '../secure-input';
import type { SecureInputProps } from '../secure-input.types';

const mockBlur = jest.fn();

jest.mock('../../button', () => {
  const React: typeof import('react') = jest.requireActual('react');

  return {
    Button: ({ icon, ...props }: { icon?: React.ReactNode }) => {
      const iconType = React.isValidElement(icon) ? icon.type : undefined;
      const iconComponent =
        typeof iconType === 'string'
          ? undefined
          : (iconType as { displayName?: string; name?: string } | undefined);

      return React.createElement('MockButton', {
        ...props,
        mockComponent: 'button',
        mockIcon:
          typeof iconType === 'string'
            ? iconType
            : (iconComponent?.displayName ?? iconComponent?.name),
      });
    },
  };
});

jest.mock('../../input', () => {
  const React: typeof import('react') = jest.requireActual('react');

  const MockInput = React.forwardRef<{ blur: () => void }, object>(function MockInput(props, ref) {
    React.useImperativeHandle(ref, () => ({ blur: mockBlur }));

    return React.createElement('MockInput', { ...props, mockComponent: 'secure-input' });
  });

  return { Input: MockInput };
});

jest.mock('lucide-uniwind/png', () => {
  function EyeIcon() {
    return null;
  }

  function EyeOffIcon() {
    return null;
  }

  return { EyeIcon, EyeOffIcon };
});

describe('SecureInput', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockBlur.mockClear();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  function render(props: Partial<SecureInputProps> = {}) {
    const onChangeText = jest.fn();

    act(() => {
      renderer = create(
        <SecureInput
          accessibilityLabel="API key"
          onChangeText={onChangeText}
          testID="api-key"
          value="secret"
          visibilityAccessibilityLabels={{ hide: 'Hide API key', show: 'Show API key' }}
          {...props}
        />,
      );
    });

    return { onChangeText, tree: renderer! };
  }

  function input() {
    return renderer!.root.findByProps({ mockComponent: 'secure-input' });
  }

  function toggle() {
    return renderer!.root.findByProps({ mockComponent: 'button' });
  }

  test('renders a controlled single-line secret field with protected trailing space', () => {
    const style = { paddingRight: 4 };
    const { onChangeText, tree } = render({ style });

    expect(input().props).toEqual(
      expect.objectContaining({
        accessibilityLabel: 'API key',
        autoCapitalize: 'none',
        autoCorrect: false,
        multiline: false,
        onChangeText,
        secureTextEntry: true,
        testID: 'api-key',
        value: 'secret',
      }),
    );
    const inputStyle = StyleSheet.flatten(input().props.style);
    const toggleHost = tree.root.findByProps({ pointerEvents: 'box-none' });

    expect(inputStyle.minHeight).toBe(44);
    expect(inputStyle.paddingRight).toBeGreaterThan(4);
    expect(toggleHost.props.className).toContain('w-11');
    expect(toggleHost.props.className).toContain('items-center');
    expect(tree.root.findByProps({ className: 'relative' })).toBeDefined();
    expect(toggle().props).toEqual(
      expect.objectContaining({
        accessibilityLabel: 'Show API key',
        hitSlop: 6,
        size: 'sm',
        testID: 'api-key-visibility-toggle',
        variant: 'ghost',
      }),
    );
    expect(toggle().props.mockIcon).toBe('EyeOffIcon');
  });

  test('switches visibility, action label, and status icon without changing the value', () => {
    render();

    act(() => toggle().props.onPress());

    expect(input().props.secureTextEntry).toBe(false);
    expect(input().props.value).toBe('secret');
    expect(toggle().props.accessibilityLabel).toBe('Hide API key');
    expect(toggle().props.mockIcon).toBe('EyeIcon');

    act(() => toggle().props.onPress());

    expect(input().props.secureTextEntry).toBe(true);
    expect(toggle().props.accessibilityLabel).toBe('Show API key');
  });

  test('keeps the visibility action available when the value is empty', () => {
    render({ value: '' });

    expect(input().props.value).toBe('');
    expect(toggle()).toBeDefined();

    act(() => toggle().props.onPress());

    expect(input().props.value).toBe('');
    expect(input().props.secureTextEntry).toBe(false);
  });

  test('starts hidden again after remounting', () => {
    render();
    act(() => toggle().props.onPress());
    expect(input().props.secureTextEntry).toBe(false);

    act(() => renderer!.unmount());
    renderer = undefined;
    render();

    expect(input().props.secureTextEntry).toBe(true);
  });

  test('disables the field and visibility action together', () => {
    render({ disabled: true });

    expect(input().props.disabled).toBe(true);
    expect(toggle().props.disabled).toBe(true);
  });

  test('keeps focus by default when visibility changes', () => {
    render();

    act(() => toggle().props.onPress());

    expect(mockBlur).not.toHaveBeenCalled();
  });

  test('blurs before changing visibility when requested', () => {
    render({ blurOnVisibilityToggle: true });

    act(() => toggle().props.onPress());

    expect(mockBlur).toHaveBeenCalledTimes(1);
    expect(input().props.secureTextEntry).toBe(false);
  });
});

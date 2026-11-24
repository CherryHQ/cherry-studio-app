import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { useLayoutEffect } from 'react';
import { KeyboardController, useKeyboardHandler } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useComposerPresentation } from '../useComposerPresentation';

jest.mock('react-native-reanimated', () =>
  jest.requireActual('@/frontend/components/Composer/components/__tests__/_sharedValueMock'),
);

const field = 42;
const search = 7;
const blur = jest.fn();
const inputRef = { current: { blur } as unknown as ComposerInputHandle };
let presentation: ReturnType<typeof useComposerPresentation>;
let renderer: ReactTestRenderer;

function Harness({ retainEditing }: { retainEditing?: boolean }) {
  const current = useComposerPresentation(inputRef, retainEditing);
  useLayoutEffect(() => {
    presentation = current;
  });
  return null;
}

function keyboard(phase: 'onStart' | 'onEnd', target: number, height: number, duration = 250) {
  const handler = jest.mocked(useKeyboardHandler).mock.lastCall![0];
  act(() => handler[phase]?.({ target, height, progress: height > 0 ? 1 : 0, duration }));
}

function expectLayout(editing: boolean, tracking: boolean) {
  expect(presentation.state.isEditing).toBe(editing);
  expect(presentation.state.keyboardVisible.get()).toBe(editing);
  expect(presentation.state.keyboardTracking.get()).toBe(tracking);
}

beforeEach(() => {
  jest.clearAllMocks();
  act(() => {
    renderer = create(<Harness />);
  });
  act(() => presentation.actions.registerInputTag(field));
});
afterEach(() => act(() => renderer.unmount()));

test('focus alone stays compact, even when another field owns a visible keyboard', () => {
  keyboard('onStart', search, 336);
  act(() => presentation.actions.setFocusedInput(inputRef.current));
  expectLayout(false, false);
  keyboard('onStart', field, 0);
  expectLayout(false, false);
});

test('starts from the native keyboard, collapses on system hide and follows the whole close', () => {
  keyboard('onStart', field, 336);
  expectLayout(true, true);
  keyboard('onStart', -1, 0);
  expectLayout(false, true);
  keyboard('onEnd', -1, 0);
  expectLayout(false, false);
  expect(blur).not.toHaveBeenCalled();
});

test('reacquires an already open keyboard when the field registers or focus transfers back', () => {
  act(() => presentation.actions.registerInputTag(null));
  keyboard('onStart', field, 300);
  expectLayout(false, false);
  act(() => presentation.actions.registerInputTag(field));
  expectLayout(true, true);
  keyboard('onStart', search, 300, 0);
  expectLayout(false, false);
  keyboard('onStart', field, 300, 0);
  expectLayout(true, true);
  act(() => presentation.actions.registerInputTag(null));
  expectLayout(false, false);
});

test('a late hide completion during a reopen keeps the composer and dock active', () => {
  keyboard('onStart', field, 320);
  keyboard('onStart', -1, 0);
  keyboard('onStart', field, 320);
  keyboard('onEnd', -1, 0);
  expectLayout(true, true);
});

test('an interactive close can be cancelled or completed', () => {
  keyboard('onStart', field, 320);
  keyboard('onStart', field, 0, -1);
  keyboard('onEnd', field, 320, -1);
  expectLayout(true, true);
  keyboard('onStart', field, 320, -1);
  keyboard('onEnd', field, 0, -1);
  expectLayout(false, false);
});

test('explicit dismissal blurs the active input once and lets the keyboard drive the layout', () => {
  act(() => presentation.actions.dismissInput());
  expect(blur).not.toHaveBeenCalled();
  act(() => presentation.actions.setFocusedInput(inputRef.current));
  keyboard('onStart', field, 320);
  act(() => {
    presentation.actions.dismissInput();
    presentation.actions.dismissInput();
  });
  expect(blur).toHaveBeenCalledTimes(1);
  expectLayout(true, true);
  keyboard('onStart', -1, 0);
  expectLayout(false, true);
});

test('dismisses the input that took focus', () => {
  const alternate = { blur: jest.fn() };
  act(() => presentation.actions.setFocusedInput(alternate));
  act(() => presentation.actions.dismissInput());
  expect(alternate.blur).toHaveBeenCalledTimes(1);
  expect(blur).not.toHaveBeenCalled();
});

test.each(['selected', 'cancelled', 'failed'])(
  'hands off to a picker (%s) after keyboard dismissal',
  async (result) => {
    let finish!: () => void;
    jest.mocked(KeyboardController.dismiss).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    act(() => presentation.actions.setFocusedInput(inputRef.current));
    keyboard('onStart', field, 320);
    const present = jest.fn(() => {
      if (result === 'failed') throw new Error(result);
      return result;
    });
    const replacement = presentation.actions.runInputReplacement(present);
    expect(blur).toHaveBeenCalledTimes(1);
    keyboard('onStart', field, 0);
    expectLayout(false, true);
    keyboard('onEnd', field, 0);
    expect(present).not.toHaveBeenCalled();
    finish();
    if (result === 'failed') await expect(replacement).rejects.toThrow(result);
    else await expect(replacement).resolves.toBe(result);
    keyboard('onStart', search, 320);
    expectLayout(false, false);
    keyboard('onStart', field, 320, 0); // Android restores the previous window's coordinates.
    expectLayout(false, false);
    act(() => presentation.actions.setFocusedInput(inputRef.current));
    expectLayout(false, false);
    keyboard('onStart', field, 320);
    expectLayout(true, true);
  },
);

test('the painting workspace retains editing until it is explicitly dismissed', () => {
  act(() => renderer.update(<Harness retainEditing />));
  act(() => presentation.actions.setFocusedInput(inputRef.current));
  keyboard('onStart', field, 300);
  keyboard('onStart', field, 0);
  keyboard('onEnd', field, 0);
  expect(presentation.state.isEditing).toBe(true);
  expect(presentation.state.keyboardVisible.get()).toBe(false);
  act(() => presentation.actions.dismissInput());
  expectLayout(false, false);
});

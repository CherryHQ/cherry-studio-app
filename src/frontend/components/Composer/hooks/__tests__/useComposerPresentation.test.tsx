import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useComposerPresentation } from '../useComposerPresentation';

const mockBlur = jest.fn();
const mockIsKeyboardVisible = KeyboardController.isVisible as jest.MockedFunction<
  typeof KeyboardController.isVisible
>;
const mockKeyboardDismiss = KeyboardController.dismiss as jest.MockedFunction<
  typeof KeyboardController.dismiss
>;
const mockAddKeyboardListener = KeyboardEvents.addListener as jest.MockedFunction<
  typeof KeyboardEvents.addListener
>;
type KeyboardEventName = Parameters<typeof KeyboardEvents.addListener>[0];
const keyboardListeners = new Map<KeyboardEventName, Set<() => void>>();
const inputRef = { current: { blur: mockBlur } as unknown as ComposerInputHandle };
let presentation: ReturnType<typeof useComposerPresentation>;
let renderer: ReactTestRenderer | undefined;
let frameCallbacks: FrameRequestCallback[];
let requestAnimationFrameSpy: jest.SpyInstance;

describe('useComposerPresentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlur.mockReset();
    mockIsKeyboardVisible.mockReturnValue(true);
    mockKeyboardDismiss.mockResolvedValue(undefined);
    keyboardListeners.clear();
    frameCallbacks = [];
    requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    mockAddKeyboardListener.mockImplementation((event, listener) => {
      const listeners = keyboardListeners.get(event) ?? new Set<() => void>();
      const callback = () => listener(KeyboardController.state());
      listeners.add(callback);
      keyboardListeners.set(event, listeners);

      return {
        remove: () => listeners.delete(callback),
      } as unknown as ReturnType<typeof KeyboardEvents.addListener>;
    });

    act(() => {
      renderer = create(<Harness />);
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    requestAnimationFrameSpy.mockRestore();
  });

  test('does not follow an already visible global keyboard before its field receives focus', () => {
    expect(presentation.state).toEqual({ isEditing: false, isKeyboardTrackingEnabled: false });
  });

  test("does not blur a resting composer or dismiss another field's keyboard", () => {
    act(() => presentation.actions.dismissInput());
    expect(mockBlur).not.toHaveBeenCalled();
    expect(presentation.state).toEqual({ isEditing: false, isKeyboardTrackingEnabled: false });
  });

  test('dismisses only once per editing session, including before the next React commit', () => {
    act(() => presentation.actions.activateInput());
    act(() => {
      presentation.actions.dismissInput();
      // The keyboard may report hidden before its closing animation completes.
      mockIsKeyboardVisible.mockReturnValue(false);
      presentation.actions.dismissInput();
    });

    expect(mockBlur).toHaveBeenCalledTimes(1);
    expect(presentation.state).toEqual({ isEditing: false, isKeyboardTrackingEnabled: true });
    act(() => emitKeyboardEvent('keyboardDidHide'));
    expect(presentation.state.isKeyboardTrackingEnabled).toBe(false);

    act(() => presentation.actions.activateInput());
    act(() => presentation.actions.dismissInput());
    expect(mockBlur).toHaveBeenCalledTimes(2);
  });

  test('follows dismissal until the keyboard finishes closing, then detaches', () => {
    act(() => presentation.actions.activateInput());
    act(() => presentation.actions.dismissInput());
    act(() => emitKeyboardEvent('keyboardWillHide'));

    expect(presentation.state).toEqual({ isEditing: false, isKeyboardTrackingEnabled: true });

    act(() => emitKeyboardEvent('keyboardDidHide'));
    expect(presentation.state).toEqual({ isEditing: false, isKeyboardTrackingEnabled: false });
  });

  test('detaches immediately when dismissed with no keyboard visible', () => {
    act(() => presentation.actions.activateInput());
    mockIsKeyboardVisible.mockReturnValue(false);

    act(() => presentation.actions.dismissInput());
    expect(presentation.state).toEqual({ isEditing: false, isKeyboardTrackingEnabled: false });
  });

  test('handles a hide delivered synchronously by native blur', () => {
    act(() => presentation.actions.activateInput());
    mockBlur.mockImplementationOnce(() => emitKeyboardEvent('keyboardDidHide'));

    act(() => presentation.actions.dismissInput());
    expect(presentation.state).toEqual({ isEditing: false, isKeyboardTrackingEnabled: false });
  });

  test('keeps a new focus connected when the previous dismissal finishes late', () => {
    act(() => presentation.actions.activateInput());
    act(() => presentation.actions.dismissInput());
    act(() => presentation.actions.activateInput());
    act(() => emitKeyboardEvent('keyboardDidHide'));

    expect(presentation.state).toEqual({ isEditing: true, isKeyboardTrackingEnabled: true });
  });

  test('removes the keyboard subscription on unmount', () => {
    expect(keyboardListeners.get('keyboardDidHide')?.size).toBe(1);
    act(() => renderer?.unmount());
    renderer = undefined;
    expect(keyboardListeners.get('keyboardDidHide')?.size).toBe(0);
  });

  test('ignores an unmatched keyboard hide while focus is being established', () => {
    mockIsKeyboardVisible.mockReturnValue(false);

    act(() => {
      presentation.actions.activateInput();
      emitKeyboardEvent('keyboardWillHide');
      emitKeyboardEvent('keyboardDidHide');
    });

    expect(presentation.state.isEditing).toBe(true);
    expect(mockBlur).not.toHaveBeenCalled();
  });

  test('preserves the current composer state when a keyboard hide notification arrives', () => {
    act(() => presentation.actions.activateInput());
    act(() => emitKeyboardEvent('keyboardWillHide'));
    act(() => emitKeyboardEvent('keyboardDidHide'));

    expect(presentation.state.isEditing).toBe(true);
    expect(mockBlur).not.toHaveBeenCalled();
  });

  test.each(['selected', 'cancelled', 'failed'] as const)(
    'preserves editing through a replacement that is %s',
    async (result) => {
      act(() => presentation.actions.activateInput());
      // Reproduce native blur delivering a hide before the next React commit.
      mockBlur.mockImplementationOnce(() => emitKeyboardEvent('keyboardWillHide'));
      const error = new Error('Picker failed');
      const present = jest.fn(() => {
        if (result === 'failed') throw error;
        return result;
      });
      let replacement!: Promise<unknown>;
      act(() => {
        replacement = presentation.actions.runInputReplacement(present).catch((error) => error);
      });

      expect(presentation.state).toEqual({ isEditing: true, isKeyboardTrackingEnabled: false });
      expect(present).not.toHaveBeenCalled();

      await act(async () => {
        await flushInputReplacement();
        expect(await replacement).toBe(result === 'failed' ? error : result);
      });
      expect(present).toHaveBeenCalledTimes(1);
      expect(presentation.state).toEqual({ isEditing: true, isKeyboardTrackingEnabled: false });

      // Search inside the model/file sheet must not end composer editing either.
      act(() => emitKeyboardEvent('keyboardWillHide'));
      act(() => emitKeyboardEvent('keyboardDidHide'));
      expect(presentation.state.isEditing).toBe(true);
      expect(mockBlur).toHaveBeenCalledTimes(1);

      // Outside dismissal still works after cancellation with no keyboard left.
      mockIsKeyboardVisible.mockReturnValue(false);
      act(() => presentation.actions.dismissInput());
      expect(presentation.state.isEditing).toBe(false);
    },
  );

  test('preserves a resting composer when a picker is opened without editing', async () => {
    await act(async () => {
      const replacement = presentation.actions.runInputReplacement(() => undefined);
      await flushInputReplacement();
      await replacement;
    });

    expect(presentation.state).toEqual({ isEditing: false, isKeyboardTrackingEnabled: false });
  });

  test('reconnects keyboard tracking when the composer field regains focus', async () => {
    act(() => presentation.actions.activateInput());
    await act(async () => {
      const replacement = presentation.actions.runInputReplacement(() => undefined);
      await flushInputReplacement();
      await replacement;
    });

    act(() => presentation.actions.activateInput());
    expect(presentation.state).toEqual({ isEditing: true, isKeyboardTrackingEnabled: true });

    act(() => emitKeyboardEvent('keyboardWillHide'));
    act(() => emitKeyboardEvent('keyboardDidHide'));
    expect(presentation.state.isEditing).toBe(true);
  });
});

function emitKeyboardEvent(event: KeyboardEventName) {
  keyboardListeners.get(event)?.forEach((listener) => listener());
}

function Harness() {
  const current = useComposerPresentation(inputRef);
  useEffect(() => {
    presentation = current;
  }, [current]);
  return null;
}

async function flushInputReplacement() {
  await Promise.resolve();
  const callbacks = frameCallbacks;
  frameCallbacks = [];
  callbacks.forEach((callback) => callback(0));
  await Promise.resolve();
}

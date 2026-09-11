import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { useEffect } from 'react';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useComposerPresentation } from '../useComposerPresentation';

const mockBlur = jest.fn();
const mockRemove = jest.fn();
const mockIsKeyboardVisible = KeyboardController.isVisible as jest.MockedFunction<
  typeof KeyboardController.isVisible
>;
const mockKeyboardDismiss = KeyboardController.dismiss as jest.MockedFunction<
  typeof KeyboardController.dismiss
>;
const mockAddKeyboardListener = KeyboardEvents.addListener as jest.MockedFunction<
  typeof KeyboardEvents.addListener
>;
const inputRef = { current: { blur: mockBlur } as unknown as ComposerInputHandle };
let presentation: ReturnType<typeof useComposerPresentation>;
let handleKeyboardWillHide: (() => void) | undefined;
let renderer: ReactTestRenderer | undefined;
let frameCallbacks: FrameRequestCallback[];
let requestAnimationFrameSpy: jest.SpyInstance;

describe('useComposerPresentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlur.mockReset();
    mockIsKeyboardVisible.mockReturnValue(true);
    mockKeyboardDismiss.mockResolvedValue(undefined);
    handleKeyboardWillHide = undefined;
    frameCallbacks = [];
    requestAnimationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });
    mockAddKeyboardListener.mockImplementation((event, listener) => {
      if (event === 'keyboardWillHide') {
        handleKeyboardWillHide = () => listener(KeyboardController.state());
      }

      return { remove: mockRemove } as unknown as ReturnType<typeof KeyboardEvents.addListener>;
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

  test('ignores an unmatched keyboard hide while focus is being established', () => {
    mockIsKeyboardVisible.mockReturnValue(false);

    act(() => {
      presentation.actions.activateInput();
      handleKeyboardWillHide?.();
    });

    expect(presentation.state.isEditing).toBe(true);
    expect(mockBlur).not.toHaveBeenCalled();
  });

  test('ends editing when the user hides a visible keyboard', () => {
    act(() => presentation.actions.activateInput());
    act(() => handleKeyboardWillHide?.());

    expect(presentation.state.isEditing).toBe(false);
    expect(mockBlur).toHaveBeenCalledTimes(1);
  });

  test.each(['selected', 'cancelled', 'failed'] as const)(
    'preserves editing through a replacement that is %s',
    async (result) => {
      act(() => presentation.actions.activateInput());
      // Reproduce native blur delivering a hide before the next React commit.
      mockBlur.mockImplementationOnce(() => handleKeyboardWillHide?.());
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
      act(() => handleKeyboardWillHide?.());
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

  test('reconnects keyboard dismissal only when the composer field regains focus', async () => {
    act(() => presentation.actions.activateInput());
    await act(async () => {
      const replacement = presentation.actions.runInputReplacement(() => undefined);
      await flushInputReplacement();
      await replacement;
    });

    act(() => presentation.actions.activateInput());
    expect(presentation.state).toEqual({ isEditing: true, isKeyboardTrackingEnabled: true });

    act(() => handleKeyboardWillHide?.());
    expect(presentation.state.isEditing).toBe(false);
  });

  test('removes the keyboard listener on unmount', () => {
    act(() => renderer?.unmount());
    renderer = undefined;

    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});

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

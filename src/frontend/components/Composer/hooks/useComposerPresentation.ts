import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { type RefObject, useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardController,
  useKeyboardHandler,
  useReanimatedFocusedInput,
} from 'react-native-keyboard-controller';
import { useAnimatedReaction, useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const hiddenKeyboard = { target: -1, visible: false, interactive: false };

export function useComposerPresentation(
  inputRef: RefObject<ComposerInputHandle | null>,
  retainEditing = false,
) {
  const [isEditing, setIsEditing] = useState(false);
  const activeInputRef = useRef<Pick<ComposerInputHandle, 'blur'> | null>(null);
  const { input: focusedField } = useReanimatedFocusedInput();
  const inputTag = useSharedValue<number | null>(null);
  const keyboard = useSharedValue(hiddenKeyboard);
  // A native picker can return with the last Android input tag and old keyboard coordinates.
  const inputReplaced = useSharedValue(false);
  const keyboardTracking = useDerivedValue(
    () => !inputReplaced.get() && keyboard.get().target === inputTag.get(),
  );
  const keyboardVisible = useDerivedValue(() => keyboardTracking.get() && keyboard.get().visible);

  useKeyboardHandler(
    {
      onStart: (event) => {
        'worklet';
        const visible = event.height > 0 && event.progress > 0;
        if (visible && inputReplaced.get() && event.target === inputTag.get()) {
          // A zero-duration Android window resync can repeat the previous field's tag.
          // Only a genuinely focused field can reclaim that already-open keyboard.
          const hasFocus = focusedField.get()?.target === event.target;
          if (!hasFocus && event.duration === 0) return;
          if (hasFocus) inputReplaced.set(false);
        }
        keyboard.set({
          // A closing keyboard still carries its original dock until the final frame.
          target: visible ? event.target : keyboard.get().target,
          visible,
          interactive: event.duration === -1,
        });
      },
      onEnd: (event) => {
        'worklet';
        const current = keyboard.get();
        if (current.interactive && event.duration === -1) {
          // Android reports the actual endpoint of an interactive dismissal here.
          keyboard.set(
            event.height > 0 && event.progress > 0
              ? { target: event.target, visible: true, interactive: false }
              : hiddenKeyboard,
          );
        } else if (!current.visible && event.height === 0) {
          // A late hide must not detach a keyboard that has already started reopening.
          keyboard.set(hiddenKeyboard);
        }
      },
    },
    [focusedField, inputReplaced, inputTag, keyboard],
  );

  // React enables the controls on the same target change. Animation never waits for its commit.
  useAnimatedReaction(
    () => keyboardVisible.get(),
    (visible, previous) => {
      if (!retainEditing && visible !== (previous ?? false)) scheduleOnRN(setIsEditing, visible);
    },
    [keyboardVisible, retainEditing],
  );

  const registerInputTag = useCallback((tag: number | null) => inputTag.set(tag), [inputTag]);

  const setFocusedInput = useCallback(
    (input: Pick<ComposerInputHandle, 'blur'> | null) => {
      activeInputRef.current = input;
      if (input) {
        inputReplaced.set(false);
        if (retainEditing) setIsEditing(true);
      }
    },
    [inputReplaced, retainEditing],
  );

  const dismissInput = useCallback(() => {
    const input = activeInputRef.current;
    activeInputRef.current = null;
    if (retainEditing) setIsEditing(false);
    input?.blur();
  }, [retainEditing]);

  const runInputReplacement = useCallback(
    async <TValue>(present: () => Promise<TValue> | TValue): Promise<TValue> => {
      const input = activeInputRef.current ?? inputRef.current;
      activeInputRef.current = null;
      input?.blur();
      try {
        await KeyboardController.dismiss();
        if (!activeInputRef.current) inputReplaced.set(true);
      } finally {
        // Let the menu's closed UI become inert before handing off to a picker.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return present();
    },
    [inputRef, inputReplaced],
  );

  const state = useMemo(
    () => ({ isEditing, keyboardTracking, keyboardVisible }),
    [isEditing, keyboardTracking, keyboardVisible],
  );
  const actions = useMemo(
    () => ({ dismissInput, registerInputTag, runInputReplacement, setFocusedInput }),
    [dismissInput, registerInputTag, runInputReplacement, setFocusedInput],
  );

  return { actions, state };
}

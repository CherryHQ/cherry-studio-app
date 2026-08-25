import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { type RefObject, useEffect } from 'react';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';

/**
 * Gives up editor focus when a keyboard that was actually visible starts to
 * hide. iOS can emit an unmatched hide event while the rich editor is becoming
 * first responder; treating that as a dismissal immediately cancels focus.
 *
 * The native field remains the source of truth for focus. Its `onBlur` owns the
 * composer's resting presentation, so this hook only requests the blur.
 */
export function useBlurComposerOnVisibleKeyboardHide(
  inputRef: RefObject<ComposerInputHandle | null>,
) {
  useEffect(() => {
    const subscription = KeyboardEvents.addListener('keyboardWillHide', () => {
      if (!KeyboardController.isVisible()) {
        return;
      }

      inputRef.current?.blur();
    });

    return () => subscription.remove();
  }, [inputRef]);
}

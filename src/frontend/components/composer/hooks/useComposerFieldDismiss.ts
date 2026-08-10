import { useCallback } from 'react';
import { KeyboardController } from 'react-native-keyboard-controller';

import { useComposerMeta } from '../context/ComposerProvider';

/**
 * Takes the keyboard down and gives up first responder. Anything that opens
 * over the composer — a picker, a settings sheet — calls this first, so the
 * overlay does not have to animate around the keyboard.
 *
 * The ＋ menu is the deliberate exception: it dismisses the keyboard without
 * blurring, which is what makes iOS restore it the instant the menu closes.
 */
export function useComposerFieldDismiss() {
  const { inputRef } = useComposerMeta();

  return useCallback(() => {
    void KeyboardController.dismiss();
    inputRef.current?.blur();
  }, [inputRef]);
}

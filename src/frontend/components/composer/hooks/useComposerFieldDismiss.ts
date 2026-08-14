import { useCallback } from 'react';
import { KeyboardController } from 'react-native-keyboard-controller';

import { useComposerMeta } from '../context/ComposerProvider';

/**
 * Takes the keyboard down and gives up first responder. Pickers and settings
 * sheets that replace the input context call this before opening.
 *
 * The ＋ menu is the deliberate exception: it dismisses the keyboard without
 * blurring, which is what makes iOS restore it the instant the menu closes.
 * The effort slider is another exception: it keeps focus and covers the live
 * keyboard while it is open.
 */
export function useComposerFieldDismiss() {
  const { inputRef } = useComposerMeta();

  return useCallback(() => {
    const dismissal = KeyboardController.dismiss();
    inputRef.current?.blur();
    return dismissal;
  }, [inputRef]);
}

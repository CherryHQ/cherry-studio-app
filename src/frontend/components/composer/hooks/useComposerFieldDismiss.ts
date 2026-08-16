import { useCallback } from 'react';
import { KeyboardController } from 'react-native-keyboard-controller';

import { useComposerMeta } from '../context/ComposerProvider';

/**
 * Takes the keyboard down and gives up first responder. Pickers and settings
 * sheets that replace the input context call this before opening.
 *
 * Two surfaces deliberately do not call it, because they sit *over* the input
 * context rather than replacing it: the ＋ menu grows upward out of its button
 * and clears the keyboard, and the effort slider covers the live keyboard while
 * it is open. Both keep focus and the keyboard exactly where they were.
 */
export function useComposerFieldDismiss() {
  const { inputRef } = useComposerMeta();

  return useCallback(() => {
    const dismissal = KeyboardController.dismiss();
    inputRef.current?.blur();
    return dismissal;
  }, [inputRef]);
}

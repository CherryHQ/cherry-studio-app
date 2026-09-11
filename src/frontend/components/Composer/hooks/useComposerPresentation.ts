import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';

/** Editing belongs to the whole composer, including its menus and pickers. */
export function useComposerPresentation(inputRef: RefObject<ComposerInputHandle | null>) {
  const [isEditing, setIsEditing] = useState(false);
  const [isKeyboardTrackingEnabled, setIsKeyboardTrackingEnabled] = useState(true);
  // Set before native blur: keyboard events can arrive before React commits.
  // Keep this guard after presentation too, since a sheet can own a search field.
  const isInputReplacedRef = useRef(false);

  const activateInput = useCallback(() => {
    isInputReplacedRef.current = false;
    setIsEditing(true);
    setIsKeyboardTrackingEnabled(true);
  }, []);

  const dismissInput = useCallback(() => {
    setIsEditing(false);
    inputRef.current?.blur();
  }, [inputRef]);

  const runInputReplacement = useCallback(
    async <TValue>(present: () => Promise<TValue> | TValue): Promise<TValue> => {
      // Preserve editing while detaching the dock. On Android an external
      // Activity can otherwise restore stale keyboard coordinates and move
      // the composer away from its hit area.
      isInputReplacedRef.current = true;
      setIsKeyboardTrackingEnabled(false);
      inputRef.current?.blur();

      try {
        await KeyboardController.dismiss();
      } finally {
        // Let the menu's closed UI become inert before handing off to a picker.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      return present();
    },
    [inputRef],
  );

  useEffect(() => {
    const subscription = KeyboardEvents.addListener('keyboardWillHide', () => {
      // iOS can emit an unmatched hide while the rich editor takes focus.
      // A replacement's dismissal and its own keyboard are not an editing exit.
      if (KeyboardController.isVisible() && !isInputReplacedRef.current) {
        dismissInput();
      }
    });

    return () => subscription.remove();
  }, [dismissInput]);

  const state = useMemo(
    () => ({ isEditing, isKeyboardTrackingEnabled }),
    [isEditing, isKeyboardTrackingEnabled],
  );
  const actions = useMemo(
    () => ({ activateInput, dismissInput, runInputReplacement }),
    [activateInput, dismissInput, runInputReplacement],
  );

  return { actions, state };
}

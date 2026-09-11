import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { type RefObject, useCallback, useMemo, useState } from 'react';
import { KeyboardController } from 'react-native-keyboard-controller';

/** Editing belongs to the whole composer, including its menus and pickers. */
export function useComposerPresentation(inputRef: RefObject<ComposerInputHandle | null>) {
  const [isEditing, setIsEditing] = useState(false);
  const [isKeyboardTrackingEnabled, setIsKeyboardTrackingEnabled] = useState(true);

  const activateInput = useCallback(() => {
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

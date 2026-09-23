import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';

/** Editing belongs to the whole composer, including its menus and pickers. */
export function useComposerPresentation(inputRef: RefObject<ComposerInputHandle | null>) {
  const [isEditing, setIsEditing] = useState(false);
  const isEditingRef = useRef(false);
  const [isKeyboardTrackingEnabled, setIsKeyboardTrackingEnabled] = useState(false);
  const isDismissPendingRef = useRef(false);

  useEffect(() => {
    const subscription = KeyboardEvents.addListener('keyboardDidHide', () => {
      // Follow the native closing animation, then stop consuming global keyboard
      // coordinates. A newer focus cancels this dismissal before a late hide.
      if (isDismissPendingRef.current) {
        isDismissPendingRef.current = false;
        setIsKeyboardTrackingEnabled(false);
      }
    });

    return () => subscription.remove();
  }, []);

  const activateInput = useCallback(() => {
    isEditingRef.current = true;
    isDismissPendingRef.current = false;
    setIsEditing(true);
    setIsKeyboardTrackingEnabled(true);
  }, []);

  const dismissInput = useCallback(() => {
    // Native blur hides the Android IME even when the field has already lost focus.
    // One editing session must issue it only once, including before React commits.
    if (!isEditingRef.current) return;
    isEditingRef.current = false;
    setIsEditing(false);
    isDismissPendingRef.current = KeyboardController.isVisible();
    if (!isDismissPendingRef.current) {
      setIsKeyboardTrackingEnabled(false);
    }
    inputRef.current?.blur();
  }, [inputRef]);

  const runInputReplacement = useCallback(
    async <TValue>(present: () => Promise<TValue> | TValue): Promise<TValue> => {
      // Preserve editing while detaching the dock. On Android an external
      // Activity can otherwise restore stale keyboard coordinates and move
      // the composer away from its hit area.
      isDismissPendingRef.current = false;
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

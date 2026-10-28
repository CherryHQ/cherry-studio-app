import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';
import { useSharedValue } from 'react-native-reanimated';

/** Editing belongs to the whole composer, including its menus and pickers. */
export function useComposerPresentation(inputRef: RefObject<ComposerInputHandle | null>) {
  const [isEditing, setIsEditing] = useState(false);
  const isEditingRef = useRef(false);
  // Read by the dock on the UI thread: focus must lift it on the keyboard's first
  // frame, not after the editing render commits.
  const keyboardTracking = useSharedValue(false);
  const isDismissPendingRef = useRef(false);
  const activeInputRef = useRef<Pick<ComposerInputHandle, 'blur'> | null>(null);

  useEffect(() => {
    const subscription = KeyboardEvents.addListener('keyboardDidHide', () => {
      // Follow the native closing animation, then stop consuming global keyboard
      // coordinates. A newer focus cancels this dismissal before a late hide.
      if (isDismissPendingRef.current) {
        isDismissPendingRef.current = false;
        keyboardTracking.set(false);
      }
    });

    return () => subscription.remove();
  }, [keyboardTracking]);

  const activateInput = useCallback(
    (input: Pick<ComposerInputHandle, 'blur'> | null = inputRef.current) => {
      activeInputRef.current = input;
      isEditingRef.current = true;
      isDismissPendingRef.current = false;
      keyboardTracking.set(true);
      setIsEditing(true);
    },
    [inputRef, keyboardTracking],
  );

  const dismissInput = useCallback(() => {
    // Native blur hides the Android IME even when the field has already lost focus.
    // One editing session must issue it only once, including before React commits.
    if (!isEditingRef.current) return;
    isEditingRef.current = false;
    setIsEditing(false);
    isDismissPendingRef.current = KeyboardController.isVisible();
    if (!isDismissPendingRef.current) {
      keyboardTracking.set(false);
    }
    (activeInputRef.current ?? inputRef.current)?.blur();
  }, [inputRef, keyboardTracking]);

  const runInputReplacement = useCallback(
    async <TValue>(present: () => Promise<TValue> | TValue): Promise<TValue> => {
      // Preserve editing while detaching the dock. On Android an external
      // Activity can otherwise restore stale keyboard coordinates and move
      // the composer away from its hit area.
      isDismissPendingRef.current = false;
      keyboardTracking.set(false);
      (activeInputRef.current ?? inputRef.current)?.blur();

      try {
        await KeyboardController.dismiss();
      } finally {
        // Let the menu's closed UI become inert before handing off to a picker.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      return present();
    },
    [inputRef, keyboardTracking],
  );

  const state = useMemo(() => ({ isEditing, keyboardTracking }), [isEditing, keyboardTracking]);
  const actions = useMemo(
    () => ({ activateInput, dismissInput, runInputReplacement }),
    [activateInput, dismissInput, runInputReplacement],
  );

  return { actions, state };
}

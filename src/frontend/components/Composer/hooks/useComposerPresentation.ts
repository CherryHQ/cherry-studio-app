import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardController,
  KeyboardEvents,
  useKeyboardHandler,
} from 'react-native-keyboard-controller';
import { useSharedValue } from 'react-native-reanimated';

// A software keyboard starts moving well within this after focus; past it, none is coming.
const keyboardStartTimeout = 400;

/** Editing belongs to the whole composer, including its menus and pickers. */
export function useComposerPresentation(inputRef: RefObject<ComposerInputHandle | null>) {
  const [isEditing, setIsEditing] = useState(false);
  const isEditingRef = useRef(false);
  // Read by the dock on the UI thread: focus must lift it on the keyboard's first
  // frame, not after the editing render commits.
  const keyboardTracking = useSharedValue(false);
  const inputTag = useSharedValue<number | null>(null);
  const isDismissPendingRef = useRef(false);
  const activationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeInputRef = useRef<Pick<ComposerInputHandle, 'blur'> | null>(null);

  const cancelActivation = useCallback(() => {
    if (activationTimerRef.current === null) return false;
    clearTimeout(activationTimerRef.current);
    activationTimerRef.current = null;
    return true;
  }, []);
  const commitActivation = useCallback(() => {
    if (cancelActivation()) setIsEditing(true);
  }, [cancelActivation]);

  useEffect(() => {
    // On iOS a React commit in flight when the keyboard starts makes Reanimated hold
    // back that start event's writes, so the dock and transcript skip the keyboard's
    // animation. Editing state therefore commits once the keyboard has started; the
    // dock and editor already follow the UI-thread signals. A newer focus cancels a
    // pending dismissal.
    const showStarted = KeyboardEvents.addListener('keyboardWillShow', commitActivation);
    const hideStarted = KeyboardEvents.addListener('keyboardWillHide', () => {
      if (isDismissPendingRef.current) setIsEditing(false);
    });
    const hidden = KeyboardEvents.addListener('keyboardDidHide', () => {
      // Follow the native closing animation, then stop consuming global keyboard
      // coordinates.
      if (isDismissPendingRef.current) {
        isDismissPendingRef.current = false;
        setIsEditing(false);
        keyboardTracking.set(false);
      }
    });

    return () => {
      showStarted.remove();
      hideStarted.remove();
      hidden.remove();
      cancelActivation();
    };
  }, [cancelActivation, commitActivation, keyboardTracking]);

  // A tap focuses the field natively, so iOS starts the keyboard before JS hears
  // of the focus. Only a dock moved inside this start event rides the keyboard's
  // own animation; enabling it later from onFocus jumps it to the final height.
  useKeyboardHandler(
    {
      onStart: (event) => {
        'worklet';
        if (event.height > 0 && event.target === inputTag.get()) {
          keyboardTracking.set(true);
        }
      },
    },
    [inputTag, keyboardTracking],
  );

  const registerInputTag = useCallback(
    (tag: number | null) => {
      inputTag.set(tag);
    },
    [inputTag],
  );

  const activateInput = useCallback(
    (input: Pick<ComposerInputHandle, 'blur'> | null = inputRef.current) => {
      activeInputRef.current = input;
      isEditingRef.current = true;
      isDismissPendingRef.current = false;
      keyboardTracking.set(true);
      if (KeyboardController.isVisible()) {
        setIsEditing(true);
      } else if (activationTimerRef.current === null) {
        // A hardware keyboard never starts one.
        activationTimerRef.current = setTimeout(commitActivation, keyboardStartTimeout);
      }
    },
    [commitActivation, inputRef, keyboardTracking],
  );

  const dismissInput = useCallback(() => {
    // Native blur hides the Android IME even when the field has already lost focus.
    // One editing session must issue it only once, including before React commits.
    if (!isEditingRef.current) return;
    isEditingRef.current = false;
    cancelActivation();
    isDismissPendingRef.current = KeyboardController.isVisible();
    if (!isDismissPendingRef.current) {
      setIsEditing(false);
      keyboardTracking.set(false);
    }
    (activeInputRef.current ?? inputRef.current)?.blur();
  }, [cancelActivation, inputRef, keyboardTracking]);

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
    () => ({ activateInput, dismissInput, registerInputTag, runInputReplacement }),
    [activateInput, dismissInput, registerInputTag, runInputReplacement],
  );

  return { actions, state };
}

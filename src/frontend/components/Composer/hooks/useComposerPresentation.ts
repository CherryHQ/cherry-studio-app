import type { ComposerInputHandle } from '@cherrystudio/ui/components';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardController } from 'react-native-keyboard-controller';

/** Only explicitly presented replacement surfaces suspend this composer's dock. */
export function useComposerPresentation(inputRef: RefObject<ComposerInputHandle | null>) {
  const activeReplacement = useRef<symbol | undefined>(undefined);
  const mounted = useRef(true);
  const [isKeyboardTrackingEnabled, setIsKeyboardTrackingEnabled] = useState(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeReplacement.current = undefined;
    };
  }, []);

  const runInputReplacement = useCallback(
    async <TValue>(present: () => Promise<TValue>): Promise<TValue | undefined> => {
      if (!mounted.current || activeReplacement.current) return;
      const operation = Symbol();
      activeReplacement.current = operation;
      setIsKeyboardTrackingEnabled(false);
      try {
        inputRef.current?.blur();
        await KeyboardController.dismiss();
        // Give the outgoing menu its removal commit before presenting native UI.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (mounted.current && activeReplacement.current === operation) {
          return await present();
        }
      } finally {
        if (activeReplacement.current === operation) {
          activeReplacement.current = undefined;
          if (mounted.current) setIsKeyboardTrackingEnabled(true);
        }
      }
    },
    [inputRef],
  );

  const state = useMemo(() => ({ isKeyboardTrackingEnabled }), [isKeyboardTrackingEnabled]);
  const actions = useMemo(() => ({ runInputReplacement }), [runInputReplacement]);
  return { actions, state };
}

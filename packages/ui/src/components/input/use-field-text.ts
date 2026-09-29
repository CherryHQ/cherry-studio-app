import { startTransition, useCallback, useState } from 'react';

type FieldText = {
  /** What the field shows. */
  text: string;
  /** The caller's value as of the last time it changed. */
  value: string;
};

/**
 * The text a controlled field hands to its native input.
 *
 * A caller's `value` can land a commit after the keystroke that produced it: a
 * bottom sheet renders its content through a portal, so state owned outside the
 * sheet reaches the field one commit late. React Native's input compares its
 * last native text with `value` in that first commit, sees the old value, and
 * writes it back into the native field before the new one arrives. On Android
 * each of those writes replaces the field's text and drops the keyboard's
 * composing region, which is how an IME that composes Latin words loses or
 * repeats characters.
 *
 * The field therefore shows the keystroke itself and takes the caller's `value`
 * whenever it changes. A caller that rejects a keystroke keeps its value
 * unchanged and never renders again, so a transition checks the keystroke after
 * every urgent update, the portal's late commit included, has landed: text the
 * caller didn't take returns to `value`. `onChangeText` must therefore not update
 * `value` in a transition itself.
 */
export function useFieldText(value: string, onChangeText: ((text: string) => void) | undefined) {
  const [field, setField] = useState<FieldText>({ text: value, value });
  let current = field;

  if (value !== field.value) {
    current = { text: value, value };
    setField(current);
  }

  const changeText = useCallback(
    (text: string) => {
      setField((previous) => ({ ...previous, text }));
      onChangeText?.(text);
      startTransition(() => {
        setField((previous) =>
          previous.text === text && previous.value !== text
            ? { ...previous, text: previous.value }
            : previous,
        );
      });
    },
    [onChangeText],
  );

  return [current.text, changeText] as const;
}

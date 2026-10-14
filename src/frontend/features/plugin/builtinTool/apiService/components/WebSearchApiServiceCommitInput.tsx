import {
  Input,
  type InputKeyboardType,
  type InputPasswordVisibilityAccessibilityLabels,
} from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextInputEndEditingEvent } from 'react-native';

type WebSearchApiServiceCommitInputProps = {
  accessibilityLabel: string;
  keyboardType?: InputKeyboardType;
  onCommit: (value: string) => void;
  onDraftChange?: (value: string) => void;
  placeholder: string;
  /** Masks the text behind a visibility toggle. */
  secret?: InputPasswordVisibilityAccessibilityLabels;
  value: string;
};

/** A settings field that saves when editing ends rather than on every keystroke. */
export function WebSearchApiServiceCommitInput({
  accessibilityLabel,
  keyboardType,
  onCommit,
  onDraftChange,
  placeholder,
  secret,
  value,
}: WebSearchApiServiceCommitInputProps) {
  const [draftValue, setDraftValue] = useState(value);
  const [sourceValue, setSourceValue] = useState(value);
  const draftValueRef = useRef(draftValue);
  const onCommitRef = useRef(onCommit);
  const valueRef = useRef(value);

  if (sourceValue !== value) {
    setSourceValue(value);
    setDraftValue(value);
  }

  useEffect(() => {
    draftValueRef.current = value;
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  const commitValue = useCallback((nextValue?: string) => {
    const resolvedValue = nextValue ?? draftValueRef.current;
    if (resolvedValue !== valueRef.current) {
      onCommitRef.current(resolvedValue);
      valueRef.current = resolvedValue;
    }
  }, []);

  useEffect(
    () => () => {
      commitValue();
    },
    [commitValue],
  );

  const handleChangeText = useCallback(
    (nextValue: string) => {
      draftValueRef.current = nextValue;
      setDraftValue(nextValue);
      onDraftChange?.(nextValue);
    },
    [onDraftChange],
  );

  const handleEndEditing = useCallback(
    (event: TextInputEndEditingEvent) => {
      draftValueRef.current = event.nativeEvent.text;
      commitValue(event.nativeEvent.text);
    },
    [commitValue],
  );

  const handleCommitEvent = useCallback(() => {
    commitValue();
  }, [commitValue]);

  const inputProps = {
    accessibilityLabel,
    lineBreakModeIOS: 'clip',
    numberOfLines: 1,
    onBlur: handleCommitEvent,
    onChangeText: handleChangeText,
    onEndEditing: handleEndEditing,
    onSubmitEditing: handleCommitEvent,
    placeholder,
    returnKeyType: 'done',
    selectTextOnFocus: true,
    value: draftValue,
  } as const;

  return secret ? (
    <Input
      {...inputProps}
      blurOnVisibilityToggle
      type="password"
      visibilityAccessibilityLabels={secret}
    />
  ) : (
    <Input {...inputProps} autoCapitalize="none" autoCorrect={false} keyboardType={keyboardType} />
  );
}

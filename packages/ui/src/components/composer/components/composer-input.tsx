import { TextInputWrapper } from 'expo-paste-input';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, type NativeSyntheticEvent } from 'react-native';
import { EnrichedMarkdownTextInput, type OnKeyPressEvent } from 'react-native-enriched-markdown';
import { useResolveClassNames } from 'uniwind';

import type { ComposerInputHandle, ComposerInputProps } from '../composer.types';
import { useComposerActions, useComposerState } from '../hooks/use-composer-context';
import { pasteWrapperStyle, textInputBoxStyle } from '../utils/composer-layout';
import { composerTextStyle } from '../utils/composer-text-style/composer-text-style';

const inputStyle = { ...textInputBoxStyle, ...composerTextStyle };

/**
 * The text field, growing with its content up to a capped height.
 *
 * The value the caller sees is **Markdown**, not the glyphs on screen: an
 * inserted entity — a tool mention — is a link, and its identity lives in the
 * URL rather than in the words it renders as. Plain text would throw that away
 * the moment it left the field.
 *
 * Nothing here parses what the user types. The underlying input only applies
 * styles it is told to apply, so typed `**stars**` stay stars, and the
 * serializer only writes delimiters around ranges that were actually styled.
 */
export function ComposerInput({
  autoFocus = false,
  markdownStyle,
  onBlur,
  onFocus,
  onPaste,
  placeholder,
  ref,
  style,
  testID,
}: ComposerInputProps) {
  const { canSend, streaming, submitBehavior, value } = useComposerState('Composer.Input');
  const { changeText, send } = useComposerActions('Composer.Input');
  // The rich editor is a Fabric host rather than RN's TextInput, so Uniwind
  // cannot resolve a className on it. Resolve the two base text properties here
  // instead. Use the font-size-only utility deliberately: the upstream Android
  // editor currently mixes dp and px when applying `lineHeight`, collapsing its
  // native line box and caret.
  const baseTextStyle = useResolveClassNames('text-(length:--text-base) text-foreground');
  const placeholderStyle = useResolveClassNames('text-foreground-tertiary');
  const fallbackRef = useRef<ComposerInputHandle | null>(null);
  const inputRef = ref ?? fallbackRef;
  // The field is uncontrolled — it owns its own text and we mirror it out. This
  // records what it last told us so the sync below can tell a value that came
  // back from the field from one the caller pushed in.
  const emitted = useRef(value);
  // Flattened rather than passed as an array: this input takes a single style
  // object, not RN's `StyleProp`.
  const resolvedStyle = useMemo(
    () => StyleSheet.flatten([baseTextStyle, inputStyle, style]),
    [baseTextStyle, style],
  );

  // Submit-on-return has to work with, not against, the uncontrolled buffer:
  // the return keystroke's native newline cannot be vetoed from JS — the key
  // press event only announces it. Send on the announcement, then treat the
  // one change that follows as that keystroke's debris and refuse to adopt it;
  // the sync effect below puts the caller's value (cleared by the send) back
  // into the field, so the newline never reaches the draft. The capture is
  // always answered by exactly one change: every path that emits `Enter` —
  // the iOS text-change delegate and the Android input-connection wrapper —
  // applies its newline right after, and the list-key interceptors only
  // consume Tab and Backspace.
  const submitCaptureRef = useRef(false);
  // Mirrored so the capture branch can push the freshest caller value without
  // the change handler's identity churning on every keystroke.
  const valueRef = useRef(value);
  valueRef.current = value;

  const handleChangeMarkdown = useCallback(
    (markdown: string) => {
      if (submitCaptureRef.current) {
        submitCaptureRef.current = false;
        // Adopt nothing from the captured edit; put the caller's value back so
        // the field cannot end up showing a newline the draft does not have.
        emitted.current = valueRef.current;
        inputRef.current?.setValue(valueRef.current);
        return;
      }
      emitted.current = markdown;
      changeText(markdown);
    },
    [changeText, inputRef],
  );

  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<OnKeyPressEvent>) => {
      if (event.nativeEvent.key !== 'Enter' || submitBehavior !== 'submit') {
        return;
      }
      // While a reply streams the send button means stop, and the send
      // protocol forbids concurrent sends; the return key does neither, so it
      // falls back to the native newline.
      if (streaming || !canSend) {
        return;
      }
      submitCaptureRef.current = true;
      send();
    },
    [canSend, send, streaming, submitBehavior],
  );

  // Pushes a caller-side change — send clearing the draft, a failed send
  // restoring it — down into the field. Guarded on `emitted`, or every
  // keystroke would round-trip through here and fight the native input for the
  // caret.
  useEffect(() => {
    if (value === emitted.current) {
      return;
    }

    emitted.current = value;
    inputRef.current?.setValue(value);
  }, [inputRef, value]);

  return (
    // Wrapped unconditionally, even with no `onPaste`. It costs one native view,
    // and the alternative — wrapping only when the prop is present — would make
    // the field's own view hierarchy depend on a callback, so a caller adding
    // paste support later would be debugging a layout change they didn't make.
    <TextInputWrapper onPaste={onPaste} style={pasteWrapperStyle}>
      <EnrichedMarkdownTextInput
        autoFocus={autoFocus}
        // Set once. Every later change goes through the sync effect above.
        defaultValue={value}
        // Turning `google.com` into a link as the user types would mint the one
        // entity this field is supposed to reserve for mentions.
        linkRegex={null}
        markdownStyle={markdownStyle}
        multiline
        onBlur={onBlur}
        onChangeMarkdown={handleChangeMarkdown}
        onFocus={onFocus}
        onKeyPress={handleKeyPress}
        placeholder={placeholder}
        placeholderTextColor={
          typeof placeholderStyle.color === 'string' ? placeholderStyle.color : undefined
        }
        ref={inputRef}
        // This is a composer, not an editor: the selection menu's Format
        // submenu and "Copy as Markdown" both offer to do things the rest of
        // the field gives no way to see or undo.
        selectionMenuConfig={{ copyAsMarkdown: { enabled: false }, format: { enabled: false } }}
        style={resolvedStyle}
        testID={testID}
      />
    </TextInputWrapper>
  );
}

ComposerInput.displayName = 'Composer.Input';

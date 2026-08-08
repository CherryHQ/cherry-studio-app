import { TextInputWrapper } from 'expo-paste-input';
import { TextInput } from 'react-native';
import { useResolveClassNames } from 'uniwind';

import { useComposerActions, useComposerState } from '../composer.context';
import { pasteWrapperStyle, textInputBoxStyle } from '../composer.layout';
import type { ComposerInputProps } from '../composer.types';
import { composerTextStyle } from '../composerTextStyle';

const inputStyle = { ...textInputBoxStyle, ...composerTextStyle };

/** The text field, growing with its content up to a capped height. */
export function ComposerInput({
  autoFocus = false,
  onPaste,
  placeholder,
  ref,
  style,
  testID,
}: ComposerInputProps) {
  const { value } = useComposerState('Composer.Input');
  const { changeText } = useComposerActions('Composer.Input');
  const placeholderStyle = useResolveClassNames('text-muted-foreground');

  return (
    // Wrapped unconditionally, even with no `onPaste`. It costs one native view,
    // and the alternative — wrapping only when the prop is present — would make
    // the field's own view hierarchy depend on a callback, so a caller adding
    // paste support later would be debugging a layout change they didn't make.
    <TextInputWrapper onPaste={onPaste} style={pasteWrapperStyle}>
      <TextInput
        autoFocus={autoFocus}
        className="text-base text-foreground"
        multiline
        onChangeText={changeText}
        placeholder={placeholder}
        placeholderTextColor={
          typeof placeholderStyle.color === 'string' ? placeholderStyle.color : undefined
        }
        ref={ref}
        style={[inputStyle, style]}
        testID={testID}
        value={value}
      />
    </TextInputWrapper>
  );
}

ComposerInput.displayName = 'Composer.Input';

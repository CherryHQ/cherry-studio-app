import { TextArea } from 'heroui-native/text-area';
import { cn } from 'heroui-native/utils';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import { chatInputMaxTextAreaHeight, chatInputMinTextAreaHeight } from '../chatInputLayout';
import {
  useChatInputActions,
  useChatInputMeta,
  useChatInputState,
} from '../context/ChatInputProvider';

// heroui-native's Input paints the border/outline `accent`-colored on focus
// (`ios:focus:outline-accent` / `android:focus:border-accent`). `border-0` only
// removes the resting border, not the focus outline, so the chat surface would
// flash a green ring when focused. Override the focus states back to transparent.
const transparentInputSurfaceClassName =
  'border-0 bg-transparent shadow-none ios:shadow-none android:shadow-none ios:focus:outline-transparent android:focus:border-transparent';

export function ChatInputTextArea() {
  const { t } = useTranslation();
  const { setDraft, setInputFocused } = useChatInputActions();
  const { inputRef } = useChatInputMeta();
  const { draft } = useChatInputState();

  return (
    <TextArea
      ref={inputRef}
      multiline
      className={cn(
        'h-auto min-h-11 flex-1 rounded-3xl pt-3! pr-12! pb-3! pl-3! text-base leading-5',
        transparentInputSurfaceClassName,
      )}
      numberOfLines={6}
      placeholder={t('chat.inputPlaceholder')}
      style={[
        styles.transparentInputSurface,
        {
          maxHeight: chatInputMaxTextAreaHeight,
          minHeight: chatInputMinTextAreaHeight,
        },
      ]}
      textAlignVertical="center"
      value={draft}
      onBlur={() => setInputFocused(false)}
      onChangeText={setDraft}
      onFocus={() => setInputFocused(true)}
    />
  );
}

const styles = StyleSheet.create({
  transparentInputSurface: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    boxShadow: 'none',
  },
});

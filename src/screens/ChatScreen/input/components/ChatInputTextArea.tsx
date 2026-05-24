import { TextArea } from 'heroui-native/text-area';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';
import {
  chatInputMaxTextAreaHeight,
  chatInputMinTextAreaHeight,
} from '@/screens/ChatScreen/input/chatInputLayout';
import {
  useChatInputActions,
  useChatInputMeta,
  useChatInputState,
} from '@/screens/ChatScreen/input/context/ChatInputProvider';

const transparentInputSurfaceClassName =
  'border-0 bg-transparent shadow-none ios:shadow-none android:shadow-none';

export function ChatInputTextArea() {
  const { t } = useTranslation();
  const { setDraft, setInputFocused } = useChatInputActions();
  const { inputRef } = useChatInputMeta();
  const { draft, isInputFocused } = useChatInputState();

  return (
    <TextArea
      ref={inputRef}
      multiline
      className={[
        'h-auto flex-1 rounded-3xl py-3 pr-4 text-base leading-5',
        transparentInputSurfaceClassName,
        isInputFocused ? '' : 'pl-1',
      ].join(' ')}
      numberOfLines={6}
      placeholder={t('chat.inputPlaceholder')}
      style={[
        styles.transparentInputSurface,
        {
          maxHeight: chatInputMaxTextAreaHeight,
          minHeight: chatInputMinTextAreaHeight,
          textAlignVertical: 'center',
        },
      ]}
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
    elevation: 0,
  },
});

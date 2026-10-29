import { BottomSheet, Button, Input } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { KeyboardController } from 'react-native-keyboard-controller';

import { useComposerPresentationActions } from '@/frontend/components/Composer';

export type EditUserMessageSheetProps = {
  /** The sent text the edit starts from, including mention labels. */
  initialText: string;
  onClose: () => void;
  /**
   * Sends the edited text as a sibling question; the original exchange stays
   * readable. Resolves true when the edit was applied, so a rejected admission
   * can keep the sheet and its text open.
   */
  onSubmit: (text: string) => Promise<boolean>;
};

/** Replaces the text of a sent question in its own editing session over the transcript. */
export function EditUserMessageSheet({
  initialText,
  onClose,
  onSubmit,
}: EditUserMessageSheetProps) {
  const { t } = useTranslation();
  const { dismissInput } = useComposerPresentationActions();
  const [text, setText] = useState(initialText);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    // The sheet covers the chat input, so its editing session and keyboard end here.
    dismissInput();
    void KeyboardController.dismiss();
    // Closing, whether submitted or cancelled, drops the keyboard of the sheet's field.
    return () => {
      mounted.current = false;
      void KeyboardController.dismiss();
    };
  }, [dismissInput]);
  const submit = () => {
    if (isSubmitting || !text.trim()) return;
    setIsSubmitting(true);
    void onSubmit(text).finally(() => {
      if (mounted.current) setIsSubmitting(false);
    });
  };
  return (
    <BottomSheet
      avoidKeyboard
      closeAction={{ accessibilityLabel: t('common.cancel') }}
      footer={
        <Button
          disabled={!text.trim() || isSubmitting}
          onPress={submit}
          testID="edit-user-message-send"
        >
          {t('chat.input.action.sendMessage')}
        </Button>
      }
      onClose={onClose}
      open
      size="medium"
      testID="edit-user-message-sheet"
      title={t('chat.messageActions.editTitle')}
    >
      <View className="gap-3 px-4 pt-1">
        <Input
          accessibilityLabel={t('chat.messageActions.editTitle')}
          autoFocus
          multiline
          onChangeText={setText}
          testID="edit-user-message-input"
          value={text}
        />
        <Text className="text-sm text-muted-foreground">
          {t('chat.messageActions.editKeepsAttachments')}
        </Text>
      </View>
    </BottomSheet>
  );
}

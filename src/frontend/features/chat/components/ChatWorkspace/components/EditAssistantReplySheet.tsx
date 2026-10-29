import { BottomSheet, Button, Input } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

/** Draft state belongs to this sheet; typing never updates the transcript or composer. */
export function EditAssistantReplySheet({
  originalText,
  available,
  onClose,
  onSave,
}: {
  originalText: string;
  available: boolean;
  onClose(): void;
  onSave(text: string): Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(originalText);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving || !available || !text.trim() || text === originalText) return;
    setSaving(true);
    try {
      if (await onSave(text)) onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <BottomSheet
      open
      size="large"
      avoidKeyboard
      dismissible={!saving}
      title={t('chat.messageActions.edit')}
      onClose={onClose}
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button disabled={saving} onPress={onClose} variant="secondary">
              {t('common.cancel')}
            </Button>
          </View>
          <View className="flex-1">
            <Button
              loading={saving}
              disabled={saving || !available || !text.trim() || text === originalText}
              onPress={() => void save()}
            >
              {t('common.save')}
            </Button>
          </View>
        </View>
      }
    >
      <View className="flex-1 gap-3 px-4 pb-4">
        <Text className="text-sm text-muted-foreground">
          {t('chat.messageActions.editDescription')}
        </Text>
        <Input
          accessibilityLabel={t('chat.messageActions.edit')}
          autoFocus
          multiline
          scrollEnabled
          textAlignVertical="top"
          className="min-h-0 flex-1"
          value={text}
          onChangeText={setText}
          maxLength={1_000_000}
          editable={!saving}
        />
      </View>
    </BottomSheet>
  );
}

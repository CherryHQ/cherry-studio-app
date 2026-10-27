import { BottomSheet, Button, Input, TextField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { FileEntryPreview } from '@/frontend/components/FileEntryPreview/FileEntryPreview';
import type { AgentQueuedInput } from '@/shared/contracts/agent';

export type QueuedInputBuffer = {
  sessionId: string;
  input: AgentQueuedInput;
  parts: { partId: string; expectedText: string; text: string }[];
  error?: string;
};

export function QueuedInputPreview({
  input,
  onClose,
}: {
  input: AgentQueuedInput;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet
      open
      size="large"
      title={t('chat.queue.preview')}
      onClose={onClose}
      closeAction={{ accessibilityLabel: t('common.close') }}
    >
      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        {input.userMessage.parts.map((part) =>
          part.type === 'text' ? (
            <Text key={part.id} selectable className="text-base text-foreground">
              {part.text}
            </Text>
          ) : part.type === 'file' ? (
            <FileEntryPreview key={part.id} entryId={part.fileEntryId} variant="attachment" />
          ) : null,
        )}
      </ScrollView>
    </BottomSheet>
  );
}

export function QueuedInputEditor({
  buffer,
  latest,
  pending,
  onChange,
  onSave,
  onClose,
}: {
  buffer: QueuedInputBuffer;
  latest?: AgentQueuedInput;
  pending: boolean;
  onChange: (partId: string, text: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const snapshot = buffer.input.userMessage.inferenceSnapshot;
  return (
    <BottomSheet
      open
      avoidKeyboard
      size="large"
      title={t('chat.queue.edit')}
      onClose={onClose}
      closeAction={{ accessibilityLabel: t('common.close') }}
      footer={
        <Button disabled={pending || buffer.parts.length === 0} loading={pending} onPress={onSave}>
          {t('common.save')}
        </Button>
      }
    >
      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        {buffer.error ? (
          <Text accessibilityLiveRegion="polite" className="text-destructive">
            {t(buffer.error)}
          </Text>
        ) : null}
        {buffer.input.userMessage.parts.map((part) => {
          if (part.type === 'file')
            return (
              <FileEntryPreview key={part.id} entryId={part.fileEntryId} variant="attachment" />
            );
          if (part.type !== 'text') return null;
          const field = buffer.parts.find(({ partId }) => partId === part.id)!;
          return (
            <TextField key={part.id} invalid={buffer.error === 'chat.queue.emptyMessage'}>
              <TextField.Label>{t('chat.queue.message')}</TextField.Label>
              <Input
                accessibilityLabel={t('chat.queue.message')}
                multiline
                disabled={pending}
                testID={`queue-edit-${part.id}`}
                value={field.text}
                onChangeText={(text) => onChange(part.id, text)}
              />
              {buffer.error === 'chat.queue.emptyMessage' ? (
                <TextField.Error>{t('chat.queue.emptyMessage')}</TextField.Error>
              ) : null}
            </TextField>
          );
        })}
        {buffer.error === 'chat.queue.staleText' && latest ? (
          <View className="gap-2">
            <Text className="text-sm font-medium text-muted-foreground">
              {t('chat.queue.latestText')}
            </Text>
            {latest.userMessage.parts.map((part) =>
              part.type === 'text' ? (
                <Text key={part.id} selectable className="text-base text-foreground">
                  {part.text}
                </Text>
              ) : null,
            )}
          </View>
        ) : null}
        <View className="gap-2">
          <Text className="text-sm font-medium text-muted-foreground">
            {t('chat.queue.readOnly')}
          </Text>
          <Text selectable className="text-sm text-muted-foreground">
            {snapshot?.status === 'supported'
              ? JSON.stringify(snapshot.snapshot, null, 2)
              : t('chat.queue.settingsUnavailable')}
          </Text>
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

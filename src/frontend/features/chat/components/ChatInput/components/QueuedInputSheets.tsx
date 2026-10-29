import { BottomSheet, Button } from '@cherrystudio/ui/components';
import { useIsFocused } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  FileEntryPreview,
  useOpenFileEntry,
  useResolvedFile,
} from '@/frontend/components/FileEntryPreview';
import type { AgentQueuedInput } from '@/shared/contracts/agent';
import type { FileEntryId } from '@/shared/data/types/file';

export function QueuedInputPreview({
  input,
  pending,
  onClose,
  onRemove,
  onTakeBack,
}: {
  input: AgentQueuedInput;
  pending: boolean;
  onClose: () => void;
  onRemove: () => void;
  onTakeBack: () => void;
}) {
  const { t } = useTranslation();
  const focused = useIsFocused();
  return (
    <BottomSheet
      open={focused}
      size="large"
      title={t('chat.queue.preview')}
      onClose={onClose}
      closeAction={{ accessibilityLabel: t('common.close') }}
      footer={
        <View className="gap-2">
          <Button
            accessibilityLabel={t('chat.queue.takeBack')}
            disabled={pending}
            loading={pending}
            onPress={onTakeBack}
            testID="queue-take-back"
          >
            {t('chat.queue.takeBack')}
          </Button>
          <Button
            accessibilityLabel={t('common.remove')}
            disabled={pending}
            onPress={onRemove}
            variant="ghost"
            testID="queue-detail-remove"
          >
            {t('common.remove')}
          </Button>
        </View>
      }
    >
      <ScrollView contentContainerClassName="gap-4 p-5" keyboardShouldPersistTaps="handled">
        {input.userMessage.parts.map((part) =>
          part.type === 'text' ? (
            <Text key={part.id} selectable className="text-base text-foreground">
              {part.text}
            </Text>
          ) : part.type === 'file' ? (
            <QueuedInputAttachment key={part.id} entryId={part.fileEntryId} onClose={onClose} />
          ) : null,
        )}
      </ScrollView>
    </BottomSheet>
  );
}

function QueuedInputAttachment({
  entryId,
  onClose,
}: {
  entryId: FileEntryId;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data } = useResolvedFile(entryId);
  const { openFileEntry } = useOpenFileEntry();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('chat.queue.previewAttachment', {
        name: data?.entry.filename ?? t('chat.queue.message'),
      })}
      disabled={!data}
      onPress={() => {
        if (data && openFileEntry(data) === 'pane') onClose();
      }}
      testID={`queue-attachment-${entryId}`}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <FileEntryPreview entryId={entryId} variant="attachment" />
      </View>
    </Pressable>
  );
}

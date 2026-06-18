import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Dialog } from 'heroui-native/dialog';
import { Input } from 'heroui-native/input';
import { useToast } from 'heroui-native/toast';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';

import { queryKeys } from '@/data/api';
import { usePins, useTopic, useTopicMutations } from '@/hooks/chat';

const topicNameMaxLength = 255;

export function useMainHeaderTopicActions() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { topicId } = useLocalSearchParams<{ topicId?: string }>();
  const topicQuery = useTopic(topicId);
  const topicPins = usePins('topic');
  const { isUpdating, updateTopic } = useTopicMutations();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const topic = topicQuery.data;
  const isTopicActionsVisible = Boolean(topicId && topic);
  const isTopicPinned = topicId ? topicPins.pinnedIds.includes(topicId) : false;
  const isPinActionDisabled =
    !topicId || topicPins.isLoading || topicPins.isRefreshing || topicPins.isMutating;
  const trimmedRenameDraft = renameDraft.trim();
  const currentTopicName = topic?.name.trim() ?? '';
  const isRenameSubmitDisabled =
    !topicId ||
    !topic ||
    isUpdating ||
    trimmedRenameDraft.length === 0 ||
    trimmedRenameDraft === currentTopicName;

  const closeRenameTopic = useCallback(() => {
    setIsRenameOpen(false);
  }, []);

  const openRenameTopic = useCallback(() => {
    if (!topic) {
      return;
    }

    Keyboard.dismiss();
    setRenameDraft(topic.name || t('topic.titleFallback'));
    setIsRenameOpen(true);
  }, [t, topic]);

  const submitRenameTopic = useCallback(async () => {
    if (isRenameSubmitDisabled || !topicId) {
      return;
    }

    try {
      await updateTopic(topicId, {
        isNameManuallyEdited: true,
        name: trimmedRenameDraft,
      });
      setIsRenameOpen(false);
    } catch {
      toast.show({
        label: t('topic.rename.failed'),
        variant: 'danger',
      });
    }
  }, [isRenameSubmitDisabled, t, toast, topicId, trimmedRenameDraft, updateTopic]);

  const toggleTopicPin = useCallback(async () => {
    if (isPinActionDisabled || !topicId) {
      return;
    }

    try {
      await topicPins.togglePin(topicId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.topics.all() });
    } catch {
      toast.show({
        label: t('topic.pin.failed'),
        variant: 'danger',
      });
    }
  }, [isPinActionDisabled, queryClient, t, toast, topicId, topicPins]);

  return {
    isPinActionDisabled,
    isTopicActionsVisible,
    isTopicPinned,
    openRenameTopic,
    renameTopicDialog: (
      <Dialog isOpen={isRenameOpen} onOpenChange={(isOpen) => !isOpen && closeRenameTopic()}>
        <Dialog.Portal unstable_accessibilityContainerViewIsModal>
          <Dialog.Overlay isCloseOnPress={!isUpdating} />
          <Dialog.Content className="gap-5 rounded-3xl bg-overlay p-5" isSwipeable={false}>
            <View className="gap-1.5">
              <Dialog.Title>{t('topic.actions.rename')}</Dialog.Title>
            </View>
            <Input
              accessibilityLabel={t('topic.rename.placeholder')}
              autoCorrect={false}
              className="rounded-2xl px-4 text-base text-foreground leading-5"
              maxLength={topicNameMaxLength}
              onChangeText={setRenameDraft}
              onSubmitEditing={() => {
                if (!isRenameSubmitDisabled) {
                  void submitRenameTopic();
                }
              }}
              placeholder={t('topic.rename.placeholder')}
              placeholderColorClassName="accent-muted"
              returnKeyType="done"
              style={styles.renameInput}
              value={renameDraft}
            />
            <View className="flex-row justify-end gap-3">
              <Pressable
                accessibilityLabel={t('common.cancel')}
                accessibilityRole="button"
                className="h-9 min-w-20 items-center justify-center rounded-xl bg-settings-grouped-surface px-4 active:opacity-80 disabled:opacity-40"
                disabled={isUpdating}
                onPress={closeRenameTopic}
              >
                <Text className="font-medium text-foreground text-sm" numberOfLines={1}>
                  {t('common.cancel')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t('common.save')}
                accessibilityRole="button"
                className="h-9 min-w-20 items-center justify-center rounded-xl bg-primary px-4 active:opacity-80 disabled:opacity-40"
                disabled={isRenameSubmitDisabled}
                onPress={() => void submitRenameTopic()}
              >
                <Text className="font-medium text-sm text-white" numberOfLines={1}>
                  {t('common.save')}
                </Text>
              </Pressable>
            </View>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    ),
    toggleTopicPin,
  };
}

const styles = StyleSheet.create({
  renameInput: {
    includeFontPadding: false,
    minHeight: 48,
    paddingBottom: 0,
    paddingTop: 0,
    textAlignVertical: 'center',
    verticalAlign: 'middle',
  },
});

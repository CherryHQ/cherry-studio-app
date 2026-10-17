import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, Surface } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { useModelPickerData } from '@/frontend/components/ModelPicker';

import { useChatReplyTarget } from '../ChatReplyTarget';

/** States where the next question continues and which models answer it. */
export function ChatReplyTargetNotice() {
  const { t } = useTranslation();
  const replyTarget = useChatReplyTarget();
  const modelPickerData = useModelPickerData({ modelType: 'all' });
  const target = replyTarget?.target;
  if (!replyTarget || !target || (!target.continueFromMessageId && !target.models)) return null;
  const names = (target.models ?? []).map(
    (modelId) => modelPickerData.getModelItem(modelId)?.model.name ?? modelId,
  );
  return (
    <Surface testID="chat-reply-target">
      <View className="flex-row items-center gap-2 py-1.5 pl-4 pr-1">
        <Pressable
          accessibilityRole="button"
          className="min-w-0 flex-1 gap-0.5"
          onPress={() => replyTarget.actions.chooseModels()}
        >
          {target.continueFromMessageId ? (
            <Text className="text-xs font-medium text-muted-foreground">
              {t('chat.branch.continuing')}
            </Text>
          ) : null}
          {names.length ? (
            <Text className="text-sm text-foreground" numberOfLines={1}>
              {t('chat.multiModel.nextModels', {
                models: names.join(t('chat.multiModel.separator')),
              })}
            </Text>
          ) : null}
        </Pressable>
        <Button
          accessibilityLabel={t('chat.branch.cancelContinuation')}
          icon={<XIcon className="text-muted-foreground" size={16} />}
          onPress={replyTarget.actions.clear}
          size="xs"
          testID="chat-reply-target-clear"
          variant="ghost"
        />
      </View>
    </Surface>
  );
}

import XIcon from '@cherrystudio/app-icons/icons/x';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { ComposerModelPill } from '@/frontend/components/Composer';
import {
  ModelPickerIcon,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/ModelPicker';
import type { UniqueModelId } from '@/shared/data/types/model';

/** Overlapping avatars stay legible up to three; the count names the rest. */
const STACKED_AVATAR_COUNT = 3;

/**
 * The composer's model control. Several one-send models show as stacked
 * avatars with a count and a clear button that returns to the Agent's model.
 */
export function ChatInputModelPill({
  model,
  onClearReplyModels,
  onPress,
  replyModels,
}: {
  model?: ModelPickerModelItem;
  onClearReplyModels: () => void;
  onPress: () => void;
  replyModels: readonly UniqueModelId[] | null;
}) {
  const { t } = useTranslation();
  const modelPickerData = useModelPickerData({ modelType: 'all' });
  if (!replyModels)
    return (
      <ComposerModelPill
        icon={
          model ? (
            <ModelPickerIcon model={model.model} provider={model.provider} size={20} />
          ) : undefined
        }
        label={model?.model.name}
        onPress={onPress}
      />
    );
  const stacked = replyModels
    .slice(0, STACKED_AVATAR_COUNT)
    .flatMap((modelId) => modelPickerData.getModelItem(modelId) ?? []);
  return (
    <ComposerModelPill
      icon={
        <View className="flex-row">
          {stacked.map((item, index) => (
            <View
              className={index > 0 ? '-ml-1.5 rounded-full border border-card' : undefined}
              key={item.modelId}
            >
              <ModelPickerIcon model={item.model} provider={item.provider} size={18} />
            </View>
          ))}
        </View>
      }
      label={t('chat.multiModel.selectedModels', { count: replyModels.length })}
      onPress={onPress}
    >
      <Pressable
        accessibilityLabel={t('chat.multiModel.clear')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onClearReplyModels}
        testID="composer-reply-models-clear"
      >
        <XIcon className="size-3.5 text-muted-foreground" />
      </Pressable>
    </ComposerModelPill>
  );
}

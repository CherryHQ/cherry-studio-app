import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

type ChatEmptyStateProps = {
  contentBottomInset: number;
};

/**
 * 还没有话题时铺在会话位置上的文案。
 *
 * 只由 `ChatScreen` 在无话题分支里渲染：一旦有话题，那一轮的用户消息与助手占位在导航发生前
 * 就已经进了快照，中间那块直接换成会话，没有「有话题但没内容」的中间态要它兜。
 */
export function ChatEmptyState({ contentBottomInset }: ChatEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ paddingBottom: contentBottomInset }}
    >
      <Text className="text-center font-semibold text-foreground text-lg">
        {t('chat.newTopic.title')}
      </Text>
      <Text className="mt-2 text-center text-foreground text-sm" numberOfLines={3}>
        {t('chat.newTopic.description')}
      </Text>
    </View>
  );
}

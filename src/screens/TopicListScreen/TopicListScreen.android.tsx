import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopicList } from './components/TopicList';
import { TopicListHeader } from './components/TopicListHeader';
import { TopicListProvider, useTopicListActions } from './context/TopicListProvider';

export function TopicListScreen() {
  const { t } = useTranslation();
  const { openNewTopic } = useTopicListActions();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <TopicListHeader onNewTopicPress={openNewTopic} />
      <Text className="px-5 pb-1 pt-3 font-medium text-foreground-secondary text-sm">
        {t('navigation.recents')}
      </Text>
      <TopicList />
    </SafeAreaView>
  );
}

export function TopicListRoute() {
  return (
    <TopicListProvider>
      <TopicListScreen />
    </TopicListProvider>
  );
}

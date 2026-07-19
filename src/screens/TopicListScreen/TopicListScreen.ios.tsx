import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { TopicList } from './components/TopicList';
import { TopicListProvider, useTopicListActions } from './context/TopicListProvider';

export function TopicListScreen() {
  const { t } = useTranslation();
  const { openNewTopic } = useTopicListActions();

  return (
    <>
      <TopicList />
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          title: t('navigation.messages'),
        }}
      />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button>{t('common.edit')}</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t('common.filter')}
          icon="line.3.horizontal.decrease"
        />
        <Stack.Toolbar.Button
          accessibilityLabel={t('navigation.newChat')}
          icon="square.and.pencil"
          onPress={openNewTopic}
        />
      </Stack.Toolbar>
    </>
  );
}

export function TopicListRoute() {
  return (
    <TopicListProvider>
      <TopicListScreen />
    </TopicListProvider>
  );
}

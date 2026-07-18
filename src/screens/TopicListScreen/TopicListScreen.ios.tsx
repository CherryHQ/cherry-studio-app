import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { TopicList } from './components/TopicList';
import { TopicListProvider, useTopicListActions } from './context/TopicListProvider';

export function TopicListScreen() {
  const { t } = useTranslation();
  const { closeSearch, openNewTopic, openSearch, setSearchText } = useTopicListActions();

  return (
    <>
      <TopicList showNewChatButton={false} />
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          title: t('navigation.messages'),
        }}
      />
      <Stack.SearchBar
        hideWhenScrolling={false}
        placement="integratedButton"
        placeholder={t('navigation.search')}
        onCancelButtonPress={closeSearch}
        onChangeText={(event) => setSearchText(event.nativeEvent.text)}
        onFocus={openSearch}
      />
      <Stack.Toolbar placement="right">
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

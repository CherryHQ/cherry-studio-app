import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { TopicList } from './components/TopicList';
import {
  TopicListProvider,
  useTopicListActions,
  useTopicListSearch,
} from './context/TopicListProvider';

export function TopicListScreen() {
  const { t } = useTranslation();
  const { isSearchActive } = useTopicListSearch();
  const { closeSearch, openSearch, setSearchText } = useTopicListActions();
  const listHeader = isSearchActive ? null : (
    <View>
      <Text className="px-5 pt-3 pb-1 font-medium text-foreground-secondary text-sm">
        {t('navigation.recents')}
      </Text>
    </View>
  );

  return (
    <>
      <TopicList ListHeaderComponent={listHeader} />
      <Stack.Screen
        options={{
          headerLargeTitle: true,
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

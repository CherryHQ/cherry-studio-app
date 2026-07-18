import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopicList } from './components/TopicList';
import { TopicListHeader } from './components/TopicListHeader';
import {
  TopicListProvider,
  useTopicListActions,
  useTopicListSearch,
} from './context/TopicListProvider';
import { useTopicListHeaderAnimation } from './hooks/useTopicListHeaderAnimation';

export function TopicListScreen() {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const { width } = useWindowDimensions();
  const { isSearchActive, searchText } = useTopicListSearch();
  const { closeSearch, openSearch, setSearchText } = useTopicListActions();
  const {
    closeButtonSize,
    closeButtonStyle,
    collapsedHeaderStyle,
    expandedSearchWidth,
    searchFieldIconStyle,
    searchFieldSlotStyle,
  } = useTopicListHeaderAnimation({ isSearchActive, screenWidth: width });

  useEffect(() => {
    if (isSearchActive) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isSearchActive]);

  const handleCloseSearch = () => {
    inputRef.current?.blur();
    closeSearch();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']} style={styles.container}>
      <View className="flex-1 gap-2" style={styles.content}>
        <TopicListHeader
          closeButtonSize={closeButtonSize}
          closeButtonStyle={closeButtonStyle}
          collapsedHeaderStyle={collapsedHeaderStyle}
          expandedSearchWidth={expandedSearchWidth}
          inputRef={inputRef}
          isSearchVisible={isSearchActive}
          onClose={handleCloseSearch}
          onSearchPress={openSearch}
          searchFieldIconStyle={searchFieldIconStyle}
          searchFieldSlotStyle={searchFieldSlotStyle}
          searchText={searchText}
          setSearchText={setSearchText}
        />
        {isSearchActive ? null : (
          <View>
            <Text className="px-5 pt-3 pb-1 font-medium text-foreground-secondary text-sm">
              {t('navigation.recents')}
            </Text>
          </View>
        )}
        <View className="flex-1" style={styles.topicListSlot}>
          <TopicList />
        </View>
      </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    gap: 8,
  },
  topicListSlot: {
    flex: 1,
  },
});

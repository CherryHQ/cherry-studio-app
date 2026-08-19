import { SearchField } from '@cherrystudio/ui/components';
import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import {
  SelectionControls,
  SelectionProvider,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/selection';

import { TopicList } from './TopicList';

const topicSelectionScope = 'conversations';

/**
 * Full topic management page (`/topics`), reached from the sidebar's
 * "view all" row: searchable list plus multi-select batch deletion. iOS search
 * lives in the native header search bar; Android uses an inline field below
 * the header.
 */
function TopicListScreenBody() {
  const { t } = useTranslation();
  const { enterEditing, exitEditing } = useSelectionActions();
  const { isDeletionPending, isEditing } = useSelectionState();
  const [searchText, setSearchText] = useState('');
  const handleEnterEditing = useCallback(() => {
    if (isDeletionPending) {
      return;
    }

    setSearchText('');
    enterEditing();
  }, [enterEditing, isDeletionPending]);
  const showsInlineSearch = Platform.OS !== 'ios' && !isEditing;

  return (
    <>
      <Stack.Screen options={{ headerLargeTitle: false, title: t('topic.list.title') }} />
      <View className="flex-1 bg-background">
        {showsInlineSearch ? (
          <View className="px-3 pt-2 pb-2">
            <SearchField
              accessibilityLabel={t('navigation.search')}
              clearAccessibilityLabel={t('common.clear')}
              onChangeText={setSearchText}
              onClear={() => setSearchText('')}
              placeholder={t('navigation.search')}
              value={searchText}
            />
          </View>
        ) : null}
        <TopicList searchText={searchText} />
        <SelectionControls scope={topicSelectionScope} />
      </View>
      {Platform.OS === 'ios' && !isEditing ? (
        <Stack.SearchBar
          autoCapitalize="none"
          hideNavigationBar={false}
          hideWhenScrolling={false}
          obscureBackground={false}
          placeholder={t('navigation.search')}
          placement="stacked"
          onCancelButtonPress={() => setSearchText('')}
          onChangeText={(event) => setSearchText(event.nativeEvent.text)}
        />
      ) : null}
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t(isEditing ? 'common.done' : 'common.edit')}
          disabled={isDeletionPending}
          onPress={isEditing ? exitEditing : handleEnterEditing}
        >
          {t(isEditing ? 'common.done' : 'common.edit')}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  );
}

export function TopicListScreen() {
  return (
    <SelectionProvider>
      <TopicListScreenBody />
    </SelectionProvider>
  );
}

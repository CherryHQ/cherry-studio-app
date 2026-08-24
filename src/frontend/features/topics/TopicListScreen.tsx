import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { type MenuItem, SearchField } from '@cherrystudio/ui/components';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/components/headers';
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
  const router = useRouter();
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
  const openNewChat = useCallback(() => {
    router.navigate({ params: {}, pathname: '/' });
  }, [router]);
  const menuItems = useMemo<readonly MenuItem[]>(
    () => [
      {
        id: 'create-chat',
        label: t('navigation.newChat'),
        onPress: openNewChat,
      },
      {
        disabled: isDeletionPending,
        id: 'select-messages',
        label: t('topic.selection.start'),
        onPress: handleEnterEditing,
      },
    ],
    [handleEnterEditing, isDeletionPending, openNewChat, t],
  );
  const menuActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.more'),
        icon: EllipsisIcon,
        items: menuItems,
        key: 'topic-actions',
        type: 'menu',
      },
    ],
    [menuItems, t],
  );
  const doneActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.done'),
        disabled: isDeletionPending,
        key: 'finish-selecting-messages',
        label: t('common.done'),
        onPress: exitEditing,
        type: 'label',
      },
    ],
    [exitEditing, isDeletionPending, t],
  );
  const showsInlineSearch = Platform.OS !== 'ios' && !isEditing;

  return (
    <>
      <RouteHeader
        rightActions={isEditing ? doneActions : menuActions}
        title={t('topic.list.title')}
      />
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

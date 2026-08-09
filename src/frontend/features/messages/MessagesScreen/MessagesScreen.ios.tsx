import { Stack, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  type MessageScope,
  MessageScopeProvider,
  MessageSelectionProvider,
  useMessageScope,
  useMessageSelectionActions,
  useMessageSelectionState,
} from '@/frontend/components/messageTabs';

import { MessagePager } from '../components/MessagePager';
import { MessageScopeTabs } from '../components/MessageScopeTabs';
import { SelectionControls } from '../components/SelectionControls';

export function MessagesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { scope, setScope } = useMessageScope();
  const { enterEditing, exitEditing } = useMessageSelectionActions();
  const { isDeletionPending, isEditing } = useMessageSelectionState();
  const isConversationScope = scope === 'conversations';
  const [searchText, setSearchText] = useState('');
  const handleEnterEditing = useCallback(() => {
    if (isDeletionPending) {
      return;
    }

    setSearchText('');
    enterEditing();
  }, [enterEditing, isDeletionPending]);
  const handleScopeChange = useCallback(
    (nextScope: MessageScope) => {
      setSearchText('');
      setScope(nextScope);
    },
    [setScope],
  );

  return (
    <>
      <View className="flex-1 bg-background">
        <MessagePager topicSearchText={searchText} />
        <SelectionControls />
      </View>
      <Stack.Screen
        options={{
          headerLargeTitle: false,
          headerShadowVisible: false,
        }}
      />
      {isEditing ? (
        <Stack.Title>
          {t(isConversationScope ? 'navigation.messages' : 'painting.history.title')}
        </Stack.Title>
      ) : (
        <Stack.Title asChild>
          <MessageScopeTabs scope={scope} onScopeChange={handleScopeChange} />
        </Stack.Title>
      )}
      {isConversationScope && !isEditing ? (
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
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={t(isEditing ? 'common.done' : 'common.edit')}
          disabled={isDeletionPending}
          onPress={isEditing ? exitEditing : handleEnterEditing}
        >
          {t(isEditing ? 'common.done' : 'common.edit')}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      {/* While editing, the selection actions own the header's right slot (see
          SelectionToolbar.ios). expo-router lets the last-rendered toolbar of a
          placement win, so we render the compose menu only when NOT editing to keep a
          single, unambiguous owner of the right slot. */}
      {isEditing ? null : (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Menu accessibilityLabel={t('navigation.new')} icon="square.and.pencil">
            <Stack.Toolbar.MenuAction icon="message" onPress={() => router.push('/topics')}>
              {t('navigation.newChat')}
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon="paintbrush" onPress={() => router.push('/paintings')}>
              {t('navigation.newPainting')}
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
        </Stack.Toolbar>
      )}
    </>
  );
}

export function MessagesRoute() {
  // iOS keeps the native tab bar visible during editing — the selection actions live
  // in the header (see SelectionToolbar.ios), so there is no need to hide the tab bar.
  // Toggling it per edit⇄done flashes and can freeze the scene under rapid taps.
  return (
    <MessageScopeProvider>
      <MessageSelectionProvider>
        <MessagesScreen />
      </MessageSelectionProvider>
    </MessageScopeProvider>
  );
}

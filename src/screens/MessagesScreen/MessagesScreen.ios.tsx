import { Stack, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  MessageScopeProvider,
  MessageSelectionProvider,
  useMessageScope,
  useMessageSelectionActions,
  useMessageSelectionState,
} from '@/components/messageTabs';
import { useSetBottomTabBarHidden } from '@/components/navigation';
import { isLiquidGlassAvailable } from '@/config/constants';

import { MessagePager } from './components/MessagePager';
import { MessageScopeTabs } from './components/MessageScopeTabs';
import { SelectionControls } from './components/SelectionControls';

export function MessagesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { scope, setScope } = useMessageScope();
  const { enterEditing, exitEditing } = useMessageSelectionActions();
  const { isEditing } = useMessageSelectionState();
  const headerHeight = useHeaderHeight();
  const isConversationScope = scope === 'conversations';

  return (
    <>
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: isLiquidGlassAvailable ? headerHeight : 0 }}
      >
        <MessagePager />
        <SelectionControls />
      </View>
      <Stack.Screen
        options={{
          headerLargeTitle: false,
        }}
      />
      {isEditing ? (
        <Stack.Title>
          {t(isConversationScope ? 'navigation.messages' : 'painting.history.title')}
        </Stack.Title>
      ) : (
        <Stack.Title asChild>
          <MessageScopeTabs scope={scope} onScopeChange={setScope} />
        </Stack.Title>
      )}
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={t(isEditing ? 'common.done' : 'common.edit')}
          onPress={isEditing ? exitEditing : enterEditing}
        >
          {t(isEditing ? 'common.done' : 'common.edit')}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu
          accessibilityLabel={t('navigation.new')}
          hidden={isEditing}
          icon="square.and.pencil"
        >
          <Stack.Toolbar.MenuAction icon="message" onPress={() => router.push('/topics')}>
            {t('navigation.newChat')}
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon="paintbrush" onPress={() => router.push('/paintings')}>
            {t('navigation.newPainting')}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}

export function MessagesRoute() {
  const setBottomTabBarHidden = useSetBottomTabBarHidden();

  return (
    <MessageScopeProvider>
      <MessageSelectionProvider onEditingChange={setBottomTabBarHidden}>
        <MessagesScreen />
      </MessageSelectionProvider>
    </MessageScopeProvider>
  );
}

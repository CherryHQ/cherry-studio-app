import { SearchField } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  type MessageScope,
  MessageScopeProvider,
  MessageSelectionProvider,
  useMessageScope,
  useMessageSelectionActions,
  useMessageSelectionState,
} from '@/frontend/components/messageTabs';
import { useSetBottomTabBarHidden } from '@/frontend/components/navigation';

import { MessageHeader } from '../components/MessageHeader';
import { MessagePager } from '../components/MessagePager';
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

  // The explicit flex:1 style backs up the className so the pager fills the
  // Android scene height (paired with the navigator's sceneStyle).
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']} style={{ flex: 1 }}>
      <MessageHeader
        isEditDisabled={isDeletionPending}
        isEditing={isEditing}
        onEditPress={isEditing ? exitEditing : handleEnterEditing}
        onNewPaintingPress={() => router.push('/paintings')}
        onNewTopicPress={() => router.push('/topics')}
        onScopeChange={handleScopeChange}
        scope={scope}
      />
      {isConversationScope && !isEditing ? (
        <View className="px-3 pb-2">
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
      <MessagePager
        showRecentsHeading
        onScopeChange={handleScopeChange}
        topicSearchText={searchText}
      />
      <SelectionControls />
    </SafeAreaView>
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

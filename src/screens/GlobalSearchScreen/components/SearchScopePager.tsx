import PagerView, { type PagerViewRef } from '@expo/ui/community/pager-view';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useSearchScope } from '../context/SearchScopeProvider';
import { AssistantSearchScreen } from '../screens/AssistantSearchScreen';
import { MessageSearchScreen } from '../screens/MessageSearchScreen';
import { SettingsSearchScreen } from '../screens/SettingsSearchScreen';
import { getSearchScopeAtIndex, getSearchScopeIndex } from '../utils/searchScope';

export function SearchScopePager() {
  const { scope, setScope } = useSearchScope();
  const pagerRef = useRef<PagerViewRef>(null);
  const [initialPage] = useState(() => getSearchScopeIndex(scope));
  const currentPageRef = useRef(initialPage);

  useEffect(() => {
    const nextPage = getSearchScopeIndex(scope);

    if (nextPage !== currentPageRef.current) {
      pagerRef.current?.setPage(nextPage);
    }
  }, [scope]);

  return (
    <PagerView
      ref={pagerRef}
      initialPage={initialPage}
      style={{ flex: 1 }}
      testID="search-scope-pager"
      onPageSelected={(event) => {
        const nextPage = event.nativeEvent.position;
        currentPageRef.current = nextPage;
        setScope(getSearchScopeAtIndex(nextPage));
      }}
    >
      <View key="assistants" className="flex-1" collapsable={false}>
        <AssistantSearchScreen />
      </View>
      <View key="messages" className="flex-1" collapsable={false}>
        <MessageSearchScreen />
      </View>
      <View key="settings" className="flex-1" collapsable={false}>
        <SettingsSearchScreen />
      </View>
    </PagerView>
  );
}

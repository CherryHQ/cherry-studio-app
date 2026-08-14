import PagerView, { type PagerViewRef } from '@expo/ui/community/pager-view';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  getMessageScopeAtIndex,
  getMessageScopeIndex,
  type MessageScope,
  useMessageScope,
  useMessageSelectionState,
} from '@/frontend/components/messageTabs';
import { DrawingList } from '@/frontend/features/paintings';
import { TopicList } from '@/frontend/features/topics';

type MessagePagerProps = {
  onScopeChange: (scope: MessageScope) => void;
  showRecentsHeading?: boolean;
  topicSearchText?: string;
};

export function MessagePager({
  onScopeChange,
  showRecentsHeading = false,
  topicSearchText = '',
}: MessagePagerProps) {
  const { t } = useTranslation();
  const { scope } = useMessageScope();
  const { isEditing } = useMessageSelectionState();
  const pagerRef = useRef<PagerViewRef>(null);
  const [initialPage] = useState(() => getMessageScopeIndex(scope));
  const currentPageRef = useRef(initialPage);

  useEffect(() => {
    const nextPage = getMessageScopeIndex(scope);
    if (nextPage !== currentPageRef.current) {
      pagerRef.current?.setPage(nextPage);
    }
  }, [scope]);

  return (
    <PagerView
      initialPage={initialPage}
      ref={pagerRef}
      scrollEnabled={!isEditing}
      style={{ flex: 1 }}
      testID="topic-list-pager"
      onPageSelected={(event) => {
        const nextPage = event.nativeEvent.position;
        currentPageRef.current = nextPage;
        onScopeChange(getMessageScopeAtIndex(nextPage));
      }}
    >
      <View key="conversations" collapsable={false} className="flex-1">
        {showRecentsHeading ? (
          <Text className="px-5 pb-1 pt-1 font-medium text-muted-foreground text-sm">
            {t('navigation.recents')}
          </Text>
        ) : null}
        <TopicList searchText={topicSearchText} />
      </View>
      <View key="drawings" collapsable={false} className="flex-1">
        <DrawingList />
      </View>
    </PagerView>
  );
}

import PagerView, { type PagerViewRef } from '@expo/ui/community/pager-view';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useTopicListScope } from '../context/TopicListScopeProvider';
import { getTopicListScopeAtIndex, getTopicListScopeIndex } from '../utils/topicListScope';
import { DrawingList } from './DrawingList';
import { TopicList } from './TopicList';

type TopicListPagerProps = {
  showRecentsHeading?: boolean;
};

export function TopicListPager({ showRecentsHeading = false }: TopicListPagerProps) {
  const { t } = useTranslation();
  const { scope, setScope } = useTopicListScope();
  const pagerRef = useRef<PagerViewRef>(null);
  const [initialPage] = useState(() => getTopicListScopeIndex(scope));
  const currentPageRef = useRef(initialPage);

  useEffect(() => {
    const nextPage = getTopicListScopeIndex(scope);

    if (nextPage !== currentPageRef.current) {
      pagerRef.current?.setPage(nextPage);
    }
  }, [scope]);

  return (
    <PagerView
      ref={pagerRef}
      initialPage={initialPage}
      // Swipe disabled: horizontal paging collides with the topic rows' own
      // swipe actions. Tabs switch pages programmatically via setScope instead.
      scrollEnabled={false}
      style={{ flex: 1 }}
      testID="topic-list-pager"
      onPageSelected={(event) => {
        const nextPage = event.nativeEvent.position;
        currentPageRef.current = nextPage;
        setScope(getTopicListScopeAtIndex(nextPage));
      }}
    >
      <View key="conversations" className="flex-1" collapsable={false}>
        {showRecentsHeading ? (
          <Text className="px-5 pb-1 pt-1 font-medium text-foreground-secondary text-sm">
            {t('navigation.recents')}
          </Text>
        ) : null}
        <TopicList />
      </View>
      <View key="drawings" className="flex-1" collapsable={false}>
        <DrawingList />
      </View>
    </PagerView>
  );
}

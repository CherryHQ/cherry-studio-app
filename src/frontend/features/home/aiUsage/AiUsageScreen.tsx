import PagerView from '@expo/ui/community/pager-view';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

import { AiUsageWeekPage } from './components/AiUsageWeekPage';
import { useAiUsageDetail } from './hooks/useAiUsageDetail';
import { AI_USAGE_CURRENT_WEEK_PAGE_INDEX } from './utils/aiUsageDetail';

const ADJACENT_PAGE_DISTANCE = 1;

export function AiUsageScreen() {
  const { i18n, t } = useTranslation();
  const { activePageIndex, pagerKey, pages, selectDate, selectPage, todayDateKey } =
    useAiUsageDetail();
  const headerHeight = useHeaderHeight();
  const locale = i18n.resolvedLanguage ?? i18n.language;

  return (
    <>
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: isLiquidGlassAvailable ? headerHeight : 0 }}
        testID="ai-usage-content"
      >
        <PagerView
          key={pagerKey}
          initialPage={AI_USAGE_CURRENT_WEEK_PAGE_INDEX}
          offscreenPageLimit={1}
          style={{ flex: 1 }}
          testID="ai-usage-pager"
          onPageSelected={(event) => selectPage(event.nativeEvent.position)}
        >
          {pages.map((page, pageIndex) => (
            <View
              key={page.key}
              className="flex-1"
              collapsable={false}
              testID={`ai-usage-week-page-${page.key}`}
            >
              <AiUsageWeekPage
                enabled={Math.abs(pageIndex - activePageIndex) <= ADJACENT_PAGE_DISTANCE}
                locale={locale}
                page={page}
                todayDateKey={todayDateKey}
                onSelectDate={(dateKey) => selectDate(page.key, dateKey)}
              />
            </View>
          ))}
        </PagerView>
      </View>
      <BackHeader title={t('aiUsage.title')} />
    </>
  );
}

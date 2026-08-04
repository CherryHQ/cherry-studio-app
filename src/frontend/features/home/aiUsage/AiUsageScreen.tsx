import { useHeaderHeight } from 'expo-router/react-navigation';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

import { AiUsageRankingSection } from './components/AiUsageRankingSection';
import { AiUsageWeeklySection } from './components/AiUsageWeeklySection';
import { useAiUsageDetail } from './hooks/useAiUsageDetail';

export function AiUsageScreen() {
  const { i18n, t } = useTranslation();
  const { activePageIndex, pages, selectDate, selectPage, todayDateKey, weekDataKey } =
    useAiUsageDetail();
  const headerHeight = useHeaderHeight();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const activePage = pages[activePageIndex];

  return (
    <>
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: isLiquidGlassAvailable ? headerHeight : 0 }}
        testID="ai-usage-content"
      >
        {activePage ? (
          <AiUsageRankingSection
            enabled
            listHeaderComponent={
              <AiUsageWeeklySection
                activePageIndex={activePageIndex}
                locale={locale}
                pages={pages}
                todayDateKey={todayDateKey}
                weekDataKey={weekDataKey}
                onSelectDate={selectDate}
                onSelectPage={selectPage}
              />
            }
            locale={locale}
            page={activePage}
          />
        ) : null}
      </View>
      <BackHeader title={t('aiUsage.title')} />
    </>
  );
}

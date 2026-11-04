import { Button } from '@cherrystudio/ui/components';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';

import { AiUsageInvocationsSection } from './components/AiUsageInvocationsSection';
import { AiUsageRankingSection } from './components/AiUsageRankingSection';
import { AiUsageWeeklySection } from './components/AiUsageWeeklySection';
import { useAiUsageDetail } from './hooks/useAiUsageDetail';

export function AiUsageScreen() {
  const [view, setView] = useState<'statistics' | 'invocations'>('statistics');
  const { i18n, t } = useTranslation();
  const { activePageIndex, pages, selectDate, selectPage, todayDateKey, weekDataKey } =
    useAiUsageDetail();
  const headerHeight = useHeaderHeight();
  const contentTopInset = resolveHeaderContentInset(headerHeight);
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const activePage = pages[activePageIndex];

  return (
    <>
      <View className="flex-1" style={{ paddingTop: contentTopInset }} testID="ai-usage-content">
        <View className="flex-row justify-center gap-2 px-4">
          <Button
            testID="ai-usage-show-statistics"
            variant="ghost"
            onPress={() => setView('statistics')}
          >
            <Button.Label>{t('aiUsage.invocations.showStatistics')}</Button.Label>
          </Button>
          <Button
            testID="ai-usage-show-invocations"
            variant="ghost"
            onPress={() => setView('invocations')}
          >
            <Button.Label>{t('aiUsage.invocations.title')}</Button.Label>
          </Button>
        </View>
        {view === 'invocations' ? (
          <AiUsageInvocationsSection locale={locale} />
        ) : activePage ? (
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
      <RouteHeader title={t('aiUsage.title')} />
    </>
  );
}

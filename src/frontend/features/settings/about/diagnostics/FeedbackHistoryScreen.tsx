import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import Trash2Icon from '@cherrystudio/app-icons/icons/trash-2';
import {
  Button,
  Chip,
  ContentState,
  Section,
  useAlert,
  useToast,
} from '@cherrystudio/ui/components';
import { useQueries } from '@tanstack/react-query';
import { useIsFocused, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackendModule, usePersistCache } from '@/frontend/data';
import type {
  DiagnosticFeedbackRecord,
  DiagnosticProcessingStatus,
} from '@/shared/contracts/diagnostics';

import { SettingsScrollPage } from '../../components/SettingsScrollPage';
import { feedbackHistoryRecords, FEEDBACK_HISTORY_KEY, forgetFeedback } from './feedbackHistory';
import { feedbackStatusQueryOptions } from './feedbackStatusQuery';

const PAGE_SIZE = 20;
const STATUS_KEYS = {
  pending: 'settings.about.feedback.status.pending',
  unprocessed: 'settings.about.feedback.status.pending',
  investigating: 'settings.about.feedback.status.investigating',
  resolved: 'settings.about.feedback.status.resolved',
  closed: 'settings.about.feedback.status.closed',
} satisfies Record<DiagnosticProcessingStatus, string>;

export function FeedbackHistoryScreen() {
  const { t, i18n } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const router = useRouter();
  const isFocused = useIsFocused();
  const diagnostics = useBackendModule('diagnostics');
  const [stored] = usePersistCache(FEEDBACK_HISTORY_KEY);
  const records = feedbackHistoryRecords(stored);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = records.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const queries = useQueries({
    queries: visible.map((record) => ({
      ...feedbackStatusQueryOptions(diagnostics, record.reportId),
      enabled: isFocused,
    })),
  });
  const isFetching = queries.some((query) => query.isFetching);
  const hasRefreshFailure = queries.some(
    (query) => query.isError || query.data?.status === 'failed',
  );
  const dateFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  function openReport(reportId: string) {
    router.push({ pathname: '/settings/about/feedback/[reportId]', params: { reportId } });
  }

  function requestDelete(record: DiagnosticFeedbackRecord) {
    alert.confirm({
      title: t('settings.about.feedback.history.deleteTitle'),
      description: t('settings.about.feedback.history.deleteDescription'),
      confirmLabel: t('common.delete'),
      role: 'destructive',
      onConfirm: () => {
        forgetFeedback(record.reportId);
        toast.show({ label: t('settings.about.feedback.history.deleted'), variant: 'success' });
      },
    });
  }

  async function refresh() {
    const results = await Promise.all(queries.map((query) => query.refetch()));
    if (
      results.some(
        (result) => result.data?.status === 'failed' && result.data.reason === 'rate_limited',
      )
    ) {
      toast.show({ label: t('settings.about.feedback.history.rateLimited'), variant: 'danger' });
    } else if (results.some((result) => result.isError || result.data?.status === 'failed')) {
      toast.show({ label: t('settings.about.feedback.history.refreshFailed'), variant: 'danger' });
    }
  }

  return (
    <>
      <SettingsScrollPage
        contentClassName="gap-4"
        headerProps={{
          title: t('settings.about.feedback.history.title'),
          rightActions: [
            {
              key: 'refresh',
              nativeIcon: require('@/assets/header-toolbar/refresh-cw.png'),
              type: 'icon',
              icon: RefreshCwIcon,
              accessibilityLabel: t('settings.about.feedback.history.refresh'),
              disabled: isFetching || visible.length === 0,
              onPress: () => void refresh(),
              testID: 'feedback-history-refresh',
            },
          ],
        }}
      >
        {records.length ? (
          <>
            {hasRefreshFailure && (
              <Text className="text-sm text-muted-foreground">
                {t('settings.about.feedback.history.refreshFailed')}
              </Text>
            )}
            <Section>
              {visible.map((record) => (
                <Section.Item
                  accessibilityActions={[{ name: 'delete', label: t('common.delete') }]}
                  key={record.reportId}
                  onAccessibilityAction={({ nativeEvent }) => {
                    if (nativeEvent.actionName === 'delete') requestDelete(record);
                  }}
                  onPress={() => openReport(record.reportId)}
                  testID={`feedback-record-${record.reportId}`}
                  label={
                    <Text className="font-medium text-base text-foreground" numberOfLines={1}>
                      {record.description.replace(/\s+/g, ' ')}
                    </Text>
                  }
                  description={
                    <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                      {dateFormatter.format(new Date(record.submittedAt))}
                    </Text>
                  }
                  trailing={
                    <View className="max-w-full flex-row items-center gap-2">
                      <Chip.Tag className="shrink px-2 py-1">
                        <Chip.Label className="text-xs" numberOfLines={1}>
                          {t(
                            record.isUnavailable
                              ? 'settings.about.feedback.status.unavailable'
                              : STATUS_KEYS[record.processingStatus],
                          )}
                        </Chip.Label>
                      </Chip.Tag>
                      <Button
                        accessibilityLabel={t('settings.about.feedback.history.delete', {
                          description: record.description.replace(/\s+/g, ' '),
                        })}
                        icon={<Trash2Icon />}
                        onPress={(event) => {
                          event.stopPropagation();
                          requestDelete(record);
                        }}
                        testID={`feedback-delete-${record.reportId}`}
                        variant="ghost"
                      />
                    </View>
                  }
                />
              ))}
            </Section>
            {pageCount > 1 && (
              <View className="flex-row items-center justify-between gap-3">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isFetching || currentPage === 0}
                  onPress={() => setPage(currentPage - 1)}
                >
                  {t('settings.about.feedback.history.previous')}
                </Button>
                <Text className="text-sm text-muted-foreground">
                  {t('settings.about.feedback.history.page', {
                    page: currentPage + 1,
                    pages: pageCount,
                  })}
                </Text>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isFetching || currentPage === pageCount - 1}
                  onPress={() => setPage(currentPage + 1)}
                >
                  {t('settings.about.feedback.history.next')}
                </Button>
              </View>
            )}
          </>
        ) : (
          <View className="py-12">
            <ContentState.Empty
              title={t('settings.about.feedback.history.emptyTitle')}
              description={t('settings.about.feedback.history.emptyDescription')}
              primaryAction={{
                children: t('settings.about.feedback.title'),
                onPress: () => router.push('/settings/about/feedback/new'),
              }}
            />
          </View>
        )}
      </SettingsScrollPage>
    </>
  );
}

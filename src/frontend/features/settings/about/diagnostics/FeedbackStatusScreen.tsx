import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { BottomSheet, ContentState, Section } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { withUniwind } from 'uniwind';

import { RouteHeader } from '@/frontend/appShell/header';
import { useBackendModule, usePersistCache } from '@/frontend/data';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import {
  type DiagnosticFeedbackRecord,
  DiagnosticReportIdSchema,
  diagnosticStatusPageUrl,
} from '@/shared/contracts/diagnostics';

import { feedbackHistoryRecords, FEEDBACK_HISTORY_KEY } from './feedbackHistory';
import { feedbackStatusQueryOptions } from './feedbackStatusQuery';
import { feedbackWebNavigationAction } from './feedbackWebNavigation';
import { useCopyReportId } from './useCopyReportId';

const StatusWebView = withUniwind(WebView);
const ORIGIN_WHITELIST = ['*'];

export function FeedbackStatusScreen() {
  const { reportId } = useLocalSearchParams<{ reportId?: string }>();
  const { t, i18n } = useTranslation();
  const parsed = DiagnosticReportIdSchema.safeParse(reportId);
  return parsed.success ? (
    <FeedbackStatusDetail
      key={parsed.data}
      reportId={parsed.data}
      language={i18n.resolvedLanguage ?? 'en-US'}
    />
  ) : (
    <>
      <RouteHeader title={t('settings.about.feedback.status.title')} />
      <View className="flex-1 items-center justify-center p-6">
        <ContentState.Error title={t('settings.about.feedback.status.unavailable')} />
      </View>
    </>
  );
}

function FeedbackStatusDetail({ reportId, language }: { reportId: string; language: string }) {
  const { t } = useTranslation();
  const [stored] = usePersistCache(FEEDBACK_HISTORY_KEY);
  const record = feedbackHistoryRecords(stored).find((entry) => entry.reportId === reportId);
  const copy = useCopyReportId(reportId);
  const [reload, setReload] = useState(0);
  return (
    <>
      <RouteHeader
        title={t('settings.about.feedback.status.title')}
        rightActions={[
          {
            key: 'copy',
            nativeIcon: 'doc.on.doc',
            type: 'icon',
            icon: CopyIcon,
            accessibilityLabel: t('settings.about.feedback.copyId'),
            onPress: () => void copy(),
            testID: 'feedback-report-copy',
          },
          {
            key: 'refresh',
            nativeIcon: 'arrow.clockwise',
            type: 'icon',
            icon: RefreshCwIcon,
            accessibilityLabel: t('settings.about.feedback.history.refresh'),
            onPress: () => setReload((value) => value + 1),
          },
        ]}
      />
      {record && <FeedbackDescription record={record} />}
      <FeedbackStatusWebPage
        key={`${reportId}:${language}:${reload}`}
        reportId={reportId}
        language={language}
      />
    </>
  );
}

function FeedbackDescription({ record }: { record: DiagnosticFeedbackRecord }) {
  const { t, i18n } = useTranslation();
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <Section variant="plain">
        <Section.Item
          accessibilityLabel={t('settings.about.diagnostics.description')}
          density="compact"
          label={
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {record.description.replace(/\s+/g, ' ')}
            </Text>
          }
          onPress={() => setOpen(true)}
          testID="feedback-description-preview"
        />
      </Section>
      {isOpen && (
        <BottomSheet
          closeAction={{ accessibilityLabel: t('common.close') }}
          onClose={() => setOpen(false)}
          open
          size="medium"
          testID="feedback-description-sheet"
          title={t('settings.about.diagnostics.description')}
        >
          <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 py-3">
            <Text
              className="text-base leading-6 text-foreground"
              testID="feedback-description-full"
            >
              {record.description}
            </Text>
            {record.lastCheckedAt && (
              <Text className="text-xs text-muted-foreground">
                {t('settings.about.feedback.history.checkedAt', {
                  time: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(record.lastCheckedAt)),
                })}
              </Text>
            )}
          </ScrollView>
        </BottomSheet>
      )}
    </>
  );
}

function FeedbackStatusWebPage({ reportId, language }: { reportId: string; language: string }) {
  const { t } = useTranslation();
  const diagnostics = useBackendModule('diagnostics');
  const { refetch } = useQuery({
    ...feedbackStatusQueryOptions(diagnostics, reportId),
    enabled: false,
  });
  // A stable native source avoids reloading the web page when its status updates MMKV.
  const [source] = useState(() => ({
    uri: diagnosticStatusPageUrl(reportId),
    headers: { 'Accept-Language': language },
  }));
  const [failure, setFailure] = useState<'unavailable' | 'loadFailed' | null>(null);
  const [attempt, setAttempt] = useState(0);

  function navigate(url: string) {
    const action = feedbackWebNavigationAction(url, reportId);
    if (action === 'external') void openExternalUrl(url);
    return action === 'allow';
  }

  return failure ? (
    <View className="flex-1 items-center justify-center p-6">
      <ContentState.Error
        title={t(
          failure === 'unavailable'
            ? 'settings.about.feedback.status.unavailable'
            : 'settings.about.feedback.status.loadFailed',
        )}
        primaryAction={{
          children: t('common.retry'),
          onPress: () => {
            setFailure(null);
            setAttempt((value) => value + 1);
          },
        }}
      />
    </View>
  ) : (
    <StatusWebView
      key={attempt}
      source={source}
      className="flex-1 bg-background"
      containerClassName="flex-1 bg-background"
      testID="feedback-status-webview"
      originWhitelist={ORIGIN_WHITELIST}
      incognito
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      javaScriptCanOpenWindowsAutomatically={false}
      onShouldStartLoadWithRequest={({ url }) => navigate(url)}
      onOpenWindow={({ nativeEvent }) => {
        navigate(nativeEvent.targetUrl);
      }}
      onError={() => setFailure('loadFailed')}
      onHttpError={({ nativeEvent }) =>
        setFailure(nativeEvent.statusCode === 404 ? 'unavailable' : 'loadFailed')
      }
      onContentProcessDidTerminate={() => setFailure('loadFailed')}
      onRenderProcessGone={() => setFailure('loadFailed')}
      onLoadEnd={() => {
        void refetch();
      }}
      startInLoadingState
      renderLoading={() => (
        <View className="absolute inset-0 items-center justify-center bg-background p-6">
          <ContentState.Loading title={t('settings.about.feedback.status.loading')} />
        </View>
      )}
    />
  );
}

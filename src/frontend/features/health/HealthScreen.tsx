import { Button, ContentState, Section, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { useBackendModule } from '@/frontend/data';
import { HEALTH_PERMISSION_SCOPES } from '@/shared/contracts';

const OVERVIEW_SCOPES = HEALTH_PERMISSION_SCOPES.filter(
  (scope) => scope !== 'health.workouts.read',
);

export function HealthScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const health = useBackendModule('health');
  const permissions = useBackendModule('permissions');
  const { toast } = useToast();
  const [requesting, setRequesting] = useState(false);
  // This query stays in memory only while the page is mounted.
  const overview = useQuery({
    queryKey: ['health-overview'],
    queryFn: ({ signal }) => health.getOverview(signal),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    networkMode: 'always',
  });
  const result = overview.isError ? undefined : overview.data;
  const requestAccess = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      await permissions.request(OVERVIEW_SCOPES);
      await overview.refetch();
    } catch {
      toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
    } finally {
      setRequesting(false);
    }
  };
  const numbers = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const dates = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <>
      <RouteHeader title={t('health.title')} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text className="text-base text-muted-foreground">{t('health.intro')}</Text>
        {overview.isPending ? <ContentState.Loading title={t('health.loading')} /> : null}
        {overview.isError ? (
          <ContentState.Error
            title={t('health.loadFailed')}
            primaryAction={{ children: t('common.retry'), onPress: () => void overview.refetch() }}
          />
        ) : null}
        {result?.state === 'unavailable' ? (
          <Text className="text-base text-muted-foreground">
            {t(`settings.permissions.reason.${result.reason}`)}
          </Text>
        ) : null}
        {result?.state === 'access-required' ? (
          <View className="gap-3">
            <Text className="text-base text-foreground">
              {t('settings.permissions.purpose.health')}
            </Text>
            {result.canRequest ? (
              <Button
                loading={requesting}
                disabled={requesting}
                onPress={() => void requestAccess()}
              >
                {t('settings.permissions.action.request')}
              </Button>
            ) : null}
          </View>
        ) : null}
        {result?.state === 'ready' ? (
          <Section title={t('health.period')} footer={t('health.noDataNote')}>
            {result.metrics.map((metric) => (
              <Section.Item
                key={metric.type}
                label={t(`health.metric.${metric.type}`)}
                description={metric.state === 'error' ? t('health.loadFailed') : undefined}
                trailing={
                  <Text className="text-base text-foreground">
                    {metric.value === null
                      ? t('health.noData')
                      : `${numbers.format(metric.value)}${metric.type === 'steps' ? '' : ` ${metric.unit}`}`}
                  </Text>
                }
              />
            ))}
          </Section>
        ) : null}
        {result?.state === 'ready' ? (
          <Text className="text-sm text-muted-foreground">
            {dates.format(new Date(result.startDate))} – {dates.format(new Date(result.endDate))}
          </Text>
        ) : null}
        {result?.state !== 'unavailable' ? (
          <Section footer={t('health.agentNote')}>
            <Section.Item
              label={t('settings.permissions.type.health')}
              onPress={() => router.push('/settings/permissions/health')}
            />
            <Section.Item label={t('navigation.agents')} onPress={() => router.push('/agents')} />
            <Section.Item label={t('health.refresh')} onPress={() => void overview.refetch()} />
          </Section>
        ) : null}
      </ScrollView>
    </>
  );
}

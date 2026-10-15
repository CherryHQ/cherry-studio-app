import { ContentState, Section } from '@cherrystudio/ui/components';
import { useIsFocused, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useQuery } from '@/frontend/data/hooks';
import { useTrashActions } from '@/frontend/hooks/trash';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

export function StorageSettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const focused = useIsFocused();
  const summary = useQuery('/trash/summary', { enabled: focused });
  const actions = useTrashActions();
  const size = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 }).format(
    (summary.data?.fileBytes ?? 0) / 1_000_000,
  );
  return (
    <SettingsScrollPage headerProps={{ title: t('storage.title') }} contentClassName="gap-4">
      <Section footer={t('trash.retention')}>
        <Section.Item
          label={t('trash.title')}
          description={summary.data ? t('trash.fileBytes', { size }) : undefined}
          onPress={() => router.push('/trash')}
        />
        <Section.Item
          label={t('trash.emptyAll')}
          showChevron={false}
          disabled={
            actions.isPending ||
            !summary.data ||
            Boolean(summary.error) ||
            summary.data.files + summary.data.sessions === 0
          }
          onPress={() => actions.requestEmpty('all')}
        />
      </Section>
      {summary.error ? (
        <ContentState.Error
          title={t('trash.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void summary.refetch() }}
        />
      ) : null}
    </SettingsScrollPage>
  );
}

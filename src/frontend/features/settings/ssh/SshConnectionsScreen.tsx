import { Button, ContentState, Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { SettingsScrollPage } from '@/frontend/features/settings/components/SettingsScrollPage';
import { useSshProfiles } from '@/frontend/hooks/ssh';

export function SshConnectionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const ssh = useBackendModule('ssh');
  const profiles = useSshProfiles();
  return (
    <SettingsScrollPage contentClassName="gap-5" headerProps={{ title: t('ssh.title') }}>
      {!ssh.isAvailable() ? (
        <Text className="text-sm text-warning">{t('ssh.error.unavailable')}</Text>
      ) : null}
      {profiles.isLoading ? (
        <ContentState.Loading title={t('ssh.loading')} />
      ) : profiles.error ? (
        <ContentState.Error
          title={t('ssh.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void profiles.refetch() }}
        />
      ) : profiles.data?.length ? (
        <Section>
          {profiles.data.map((profile) => (
            <Section.Item
              key={profile.id}
              label={profile.name}
              description={`${profile.username}@${profile.host}:${profile.port}`}
              onPress={() =>
                router.push({
                  pathname: '/settings/ssh/[profileId]',
                  params: { profileId: profile.id },
                })
              }
            />
          ))}
        </Section>
      ) : (
        <ContentState.Empty title={t('ssh.empty')} description={t('ssh.description')} />
      )}
      <Button onPress={() => router.push('/settings/ssh/new')}>{t('ssh.add')}</Button>
    </SettingsScrollPage>
  );
}

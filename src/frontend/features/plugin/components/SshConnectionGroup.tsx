import NetworkIcon from '@cherrystudio/app-icons/icons/network';
import { ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useSshProfiles } from '@/frontend/hooks/ssh';

import { PluginGroup } from './PluginGroup';
import { PluginRow } from './PluginRow';

export function SshConnectionGroup() {
  const { t } = useTranslation();
  const router = useRouter();
  const profiles = useSshProfiles();
  const ssh = useBackendModule('ssh');
  const add = () => router.push('/plugins/ssh/new');
  return (
    <PluginGroup title={t('ssh.title')} testID="plugins-ssh">
      {!ssh.isAvailable() ? (
        <Text className="text-sm text-muted-foreground">{t('ssh.error.unavailable')}</Text>
      ) : null}
      {profiles.isLoading ? <ContentState.Loading title={t('ssh.loading')} /> : null}
      {profiles.error ? (
        <ContentState.Error
          title={t('ssh.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void profiles.refetch() }}
        />
      ) : null}
      {profiles.data?.map((profile) => (
        <PluginRow
          key={profile.id}
          title={profile.name}
          description={`${profile.username}@${profile.host}:${profile.port} · ${profile.remoteDirectory}`}
          icon={<NetworkIcon className="size-6 text-foreground" />}
          status={
            !profile.isEnabled
              ? { label: t('ssh.disabled'), tone: 'default' }
              : profile.fingerprint
                ? undefined
                : { label: t('ssh.untrusted'), tone: 'default' }
          }
          onPress={() =>
            router.push({
              pathname: '/plugins/ssh/[profileId]',
              params: { profileId: profile.id },
            })
          }
          testID={`plugins-ssh-${profile.id}`}
        />
      ))}
      <PluginRow
        title={t('ssh.add')}
        icon={<NetworkIcon className="size-6 text-foreground" />}
        addAction={{ accessibilityLabel: t('ssh.add'), onPress: add }}
        onPress={add}
        testID="plugins-ssh-create"
      />
    </PluginGroup>
  );
}

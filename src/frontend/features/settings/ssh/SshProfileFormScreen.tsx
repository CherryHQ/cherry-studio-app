import {
  Button,
  ContentState,
  Input,
  Section,
  TextField,
  useAlert,
} from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { SettingsScrollPage } from '@/frontend/features/settings/components/SettingsScrollPage';
import { useSshAction, useSshProfiles } from '@/frontend/hooks/ssh';
import {
  SaveSshProfileSchema,
  type SaveSshProfile,
  type SshProfile,
} from '@/shared/data/types/ssh';

export function SshProfileFormScreen() {
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  const profiles = useSshProfiles();
  const { t } = useTranslation();
  const profile = profiles.data?.find((item) => item.id === profileId);
  if (profileId && !profile)
    return (
      <SettingsScrollPage headerProps={{ title: t('ssh.title') }}>
        {profiles.isLoading ? (
          <ContentState.Loading title={t('ssh.loading')} />
        ) : (
          <ContentState.Error
            title={t('ssh.loadFailed')}
            primaryAction={{ children: t('common.retry'), onPress: () => void profiles.refetch() }}
          />
        )}
      </SettingsScrollPage>
    );
  return <SshProfileForm key={profile?.revision ?? 'new'} profile={profile} />;
}

function SshProfileForm({ profile }: { profile?: SshProfile }) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const router = useRouter();
  const ssh = useBackendModule('ssh');
  const action = useSshAction();
  const [name, setName] = useState(profile?.name ?? '');
  const [host, setHost] = useState(profile?.host ?? '');
  const [port, setPort] = useState(String(profile?.port ?? 22));
  const [username, setUsername] = useState(profile?.username ?? '');
  const [authMethod, setAuthMethod] = useState(profile?.authMethod ?? 'password');
  const [secret, setSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [replaceCredential, setReplaceCredential] = useState(!profile);
  const needsCredential = replaceCredential || profile?.authMethod !== authMethod;
  async function save() {
    const input: SaveSshProfile = {
      profile: {
        name: name.trim() || `${username.trim()}@${host.trim()}`,
        host,
        port: Number(port),
        username,
        authMethod,
      },
      ...(profile ? { previous: { id: profile.id, revision: profile.revision } } : {}),
      ...(needsCredential
        ? {
            credential:
              authMethod === 'password'
                ? { authMethod, password: secret }
                : { authMethod, privateKey: secret, passphrase },
          }
        : {}),
    };
    if (!SaveSshProfileSchema.safeParse(input).success) {
      alert.show({ title: t('ssh.error.invalidInput') });
      return;
    }
    const saved = await action.run(() => ssh.save(input));
    if (saved) {
      setSecret('');
      setPassphrase('');
      router.replace({ pathname: '/settings/ssh/[profileId]', params: { profileId: saved.id } });
    }
  }
  return (
    <SettingsScrollPage
      contentClassName="gap-5"
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      headerProps={{ title: t(profile ? 'ssh.edit' : 'ssh.add') }}
    >
      <View className="gap-4">
        <TextField>
          <TextField.Label>{t('ssh.name')}</TextField.Label>
          <Input
            accessibilityLabel={t('ssh.name')}
            value={name}
            onChangeText={setName}
            maxLength={100}
          />
        </TextField>
        <TextField required>
          <TextField.Label>{t('ssh.host')}</TextField.Label>
          <Input
            accessibilityLabel={t('ssh.host')}
            value={host}
            onChangeText={setHost}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={253}
          />
        </TextField>
        <TextField required>
          <TextField.Label>{t('ssh.port')}</TextField.Label>
          <Input
            accessibilityLabel={t('ssh.port')}
            value={port}
            onChangeText={setPort}
            keyboardType="number-pad"
            maxLength={5}
          />
        </TextField>
        <TextField required>
          <TextField.Label>{t('ssh.username')}</TextField.Label>
          <Input
            accessibilityLabel={t('ssh.username')}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={256}
          />
        </TextField>
      </View>
      <Section title={t('ssh.authentication')} footer={t('ssh.credentialNotice')}>
        <Section.RadioItem
          label={t('ssh.password')}
          selected={authMethod === 'password'}
          onPress={() => {
            setAuthMethod('password');
            setSecret('');
            setPassphrase('');
          }}
        />
        <Section.RadioItem
          label={t('ssh.privateKey')}
          selected={authMethod === 'privateKey'}
          onPress={() => {
            setAuthMethod('privateKey');
            setSecret('');
            setPassphrase('');
          }}
        />
        {profile ? (
          <Section.SwitchItem
            label={t('ssh.replaceCredential')}
            value={replaceCredential}
            onValueChange={setReplaceCredential}
          />
        ) : null}
      </Section>
      {needsCredential ? (
        <View className="gap-4">
          <TextField required>
            <TextField.Label>
              {t(authMethod === 'password' ? 'ssh.password' : 'ssh.privateKey')}
            </TextField.Label>
            {authMethod === 'password' ? (
              <Input
                accessibilityLabel={t('ssh.password')}
                textContentType="none"
                autoComplete="off"
                value={secret}
                onChangeText={setSecret}
                type="password"
                visibilityAccessibilityLabels={{
                  hide: t('ssh.hidePassword'),
                  show: t('ssh.showPassword'),
                }}
                maxLength={65536}
              />
            ) : (
              <Input
                accessibilityLabel={t('ssh.privateKey')}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="none"
                autoComplete="off"
                value={secret}
                onChangeText={setSecret}
                multiline
                maxLength={65536}
              />
            )}
          </TextField>
          {authMethod === 'privateKey' ? (
            <TextField>
              <TextField.Label>{t('ssh.passphrase')}</TextField.Label>
              <Input
                accessibilityLabel={t('ssh.passphrase')}
                value={passphrase}
                onChangeText={setPassphrase}
                autoComplete="off"
                type="password"
                visibilityAccessibilityLabels={{
                  hide: t('ssh.hidePassword'),
                  show: t('ssh.showPassword'),
                }}
                maxLength={65536}
              />
            </TextField>
          ) : null}
        </View>
      ) : null}
      <Button loading={action.busy} onPress={() => void save()}>
        {t('common.save')}
      </Button>
    </SettingsScrollPage>
  );
}

import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import TerminalIcon from '@cherrystudio/app-icons/icons/terminal';
import {
  Button,
  ContentState,
  Input,
  Switch,
  Tabs,
  TextField,
  useAlert,
} from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { RouteHeader } from '@/frontend/appShell/header';
import { PluginIcon } from '@/frontend/components/PluginIcon';
import { useBackendModule } from '@/frontend/data';
import { useSshAction, useSshProfiles } from '@/frontend/hooks/ssh';
import type { SshHostProbe } from '@/shared/contracts/ssh';
import {
  SaveSshProfileSchema,
  type SaveSshProfile,
  type SshProfile,
} from '@/shared/data/types/ssh';

import { PluginPage } from '../components/PluginPage';
import { SshAgentPicker } from './SshAgentPicker';
import { SshHostTrustDialog } from './SshHostTrustDialog';

export function SshProfileScreen() {
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  const profiles = useSshProfiles();
  const { t } = useTranslation();
  const isCreating = !profileId || profileId === 'new';
  const profile = isCreating ? undefined : profiles.data?.find((item) => item.id === profileId);
  if (!isCreating && !profile)
    return (
      <>
        <RouteHeader title={t('ssh.title')} />
        <PluginPage>
          {profiles.isLoading ? (
            <ContentState.Loading title={t('ssh.loading')} />
          ) : (
            <ContentState.Error
              title={t('ssh.loadFailed')}
              primaryAction={{
                children: t('common.retry'),
                onPress: () => void profiles.refetch(),
              }}
            />
          )}
        </PluginPage>
      </>
    );
  return <SshProfileEditor key={profile?.revision ?? 'new'} profile={profile} />;
}

function SshProfileEditor({ profile }: { profile?: SshProfile }) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const router = useRouter();
  const ssh = useBackendModule('ssh');
  const action = useSshAction();
  const [name, setName] = useState(profile?.name ?? '');
  const [host, setHost] = useState(profile?.host ?? '');
  const [port, setPort] = useState(String(profile?.port ?? 22));
  const [username, setUsername] = useState(profile?.username ?? '');
  const [remoteDirectory, setRemoteDirectory] = useState(profile?.remoteDirectory ?? '.');
  const [authMethod, setAuthMethod] = useState(profile?.authMethod ?? 'password');
  const [secret, setSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [replaceCredential, setReplaceCredential] = useState(!profile);
  const [pickAgent, setPickAgent] = useState(false);
  const [hostProbe, setHostProbe] = useState<SshHostProbe | null>(null);
  const needsCredential = replaceCredential || profile?.authMethod !== authMethod;
  const hasChanges =
    !profile ||
    needsCredential ||
    (name.trim() || `${username.trim()}@${host.trim()}`) !== profile.name ||
    host.trim() !== profile.host ||
    Number(port) !== profile.port ||
    username.trim() !== profile.username ||
    (remoteDirectory.trim() || '.') !== profile.remoteDirectory;
  const canConnect = Boolean(
    profile?.isEnabled && profile.fingerprint && ssh.isAvailable() && !hasChanges && !action.busy,
  );

  async function save() {
    const input: SaveSshProfile = {
      profile: {
        isEnabled: profile?.isEnabled ?? true,
        name: name.trim() || `${username.trim()}@${host.trim()}`,
        host,
        port: Number(port),
        username,
        authMethod,
        remoteDirectory: remoteDirectory.trim() || '.',
      },
      ...(profile ? { previous: profile } : {}),
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
    if (saved && !profile) {
      setSecret('');
      setPassphrase('');
      router.replace({ pathname: '/plugins/ssh/[profileId]', params: { profileId: saved.id } });
    }
  }

  async function probe() {
    if (!profile) return;
    const result = await action.run((signal) => ssh.probe(profile, signal));
    if (!result) return;
    if (profile.fingerprint && profile.fingerprint !== result.fingerprint) {
      setHostProbe(result);
    } else {
      alert.confirm({
        title: t('ssh.trustTitle'),
        description: t('ssh.trustDescription', {
          target: `${profile.host}:${profile.port}`,
          fingerprint: result.fingerprint,
        }),
        confirmLabel: t('ssh.trust'),
        onConfirm: () => {
          void action.run(() => ssh.trust(result.token));
        },
      });
    }
  }

  function remove() {
    if (!profile) return;
    alert.confirm({
      title: t('ssh.removeTitle'),
      description: t('ssh.removeDescription', { name: profile.name }),
      confirmLabel: t('common.remove'),
      role: 'destructive',
      onConfirm: () => {
        void action
          .run(async () => {
            await ssh.remove(profile);
            return true;
          })
          .then((removed) => {
            if (removed) router.back();
          });
      },
    });
  }

  return (
    <>
      <RouteHeader
        title={profile?.name ?? t('ssh.add')}
        rightActions={
          profile
            ? [
                {
                  key: 'ssh-actions',
                  type: 'menu',
                  icon: EllipsisIcon,
                  nativeIcon: require('@/assets/header-toolbar/ellipsis.png'),
                  accessibilityLabel: t('common.more'),
                  disabled: action.busy || hasChanges,
                  items: [
                    {
                      id: 'enabled',
                      label: t(profile.isEnabled ? 'ssh.disable' : 'ssh.enable'),
                      onPress: () => {
                        void action.run(() =>
                          ssh.save({
                            previous: profile,
                            profile: { ...profile, isEnabled: !profile.isEnabled },
                          }),
                        );
                      },
                    },
                    {
                      id: 'files',
                      label: t('ssh.files.title'),
                      disabled: !canConnect,
                      onPress: () =>
                        router.push({
                          pathname: '/plugins/ssh/files',
                          params: { profileId: profile.id },
                        }),
                    },
                    {
                      id: 'use-with-ai',
                      label: t('ssh.useWithAi'),
                      disabled: !canConnect,
                      onPress: () => setPickAgent(true),
                    },
                    { id: 'remove', label: t('common.remove'), destructive: true, onPress: remove },
                  ],
                },
              ]
            : undefined
        }
      />
      <PluginPage
        testID="ssh-profile"
        footer={
          <Button
            disabled={action.busy || !hasChanges}
            loading={action.busy}
            onPress={() => void save()}
            size="lg"
            testID="ssh-profile-save"
          >
            {t('common.save')}
          </Button>
        }
      >
        <View className="flex-row items-center gap-4">
          <PluginIcon glyph={TerminalIcon} size="large" />
          <View className="min-w-0 flex-1 gap-1">
            <Text
              accessibilityRole="header"
              className="text-2xl font-semibold text-foreground"
              numberOfLines={1}
            >
              {profile?.name ?? t('ssh.title')}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {profile && !profile.isEnabled ? t('ssh.disabled') : t('ssh.description')}
            </Text>
          </View>
        </View>
        <View className="gap-4">
          <FormField label={t('ssh.name')} disabled={action.busy}>
            <Input
              accessibilityLabel={t('ssh.name')}
              value={name}
              onChangeText={setName}
              maxLength={100}
            />
          </FormField>
          <FormField required label={t('ssh.host')} disabled={action.busy}>
            <Input
              accessibilityLabel={t('ssh.host')}
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={253}
            />
          </FormField>
          <FormField required label={t('ssh.port')} disabled={action.busy}>
            <Input
              accessibilityLabel={t('ssh.port')}
              value={port}
              onChangeText={setPort}
              keyboardType="number-pad"
              maxLength={5}
            />
          </FormField>
          <FormField required label={t('ssh.username')} disabled={action.busy}>
            <Input
              accessibilityLabel={t('ssh.username')}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={256}
            />
          </FormField>
          <FormField label={t('ssh.remoteDirectory')} disabled={action.busy}>
            <Input
              accessibilityLabel={t('ssh.remoteDirectory')}
              value={remoteDirectory}
              onChangeText={setRemoteDirectory}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={4096}
            />
            <TextField.Description>{t('ssh.remoteDirectoryHint')}</TextField.Description>
          </FormField>
          <FormField label={t('ssh.authentication')} disabled={action.busy}>
            <Tabs<SshProfile['authMethod']>
              accessibilityLabel={t('ssh.authentication')}
              items={[
                { value: 'password', label: t('ssh.password'), disabled: action.busy },
                { value: 'privateKey', label: t('ssh.privateKey'), disabled: action.busy },
              ]}
              value={authMethod}
              onValueChange={(value) => {
                if (value === authMethod) return;
                setAuthMethod(value);
                setSecret('');
                setPassphrase('');
              }}
            />
            <TextField.Description>{t('ssh.credentialNotice')}</TextField.Description>
          </FormField>
          {profile && profile.authMethod === authMethod ? (
            <View className="flex-row items-center justify-between gap-4">
              <Text className="min-w-0 flex-1 text-sm text-foreground">
                {t('ssh.replaceCredential')}
              </Text>
              <Switch
                accessibilityLabel={t('ssh.replaceCredential')}
                disabled={action.busy}
                value={replaceCredential}
                onValueChange={setReplaceCredential}
              />
            </View>
          ) : null}
          {needsCredential ? (
            <>
              <FormField
                required
                label={t(authMethod === 'password' ? 'ssh.password' : 'ssh.privateKey')}
                disabled={action.busy}
              >
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
              </FormField>
              {authMethod === 'privateKey' ? (
                <FormField label={t('ssh.passphrase')} disabled={action.busy}>
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
                </FormField>
              ) : null}
            </>
          ) : null}
        </View>
        {profile ? (
          <FormField label={t('ssh.fingerprint')}>
            <Text selectable className="font-mono text-sm text-muted-foreground">
              {profile.fingerprint ?? t('ssh.untrusted')}
            </Text>
            <Button
              variant="outline"
              disabled={action.busy || hasChanges || !profile.isEnabled || !ssh.isAvailable()}
              onPress={() => void probe()}
            >
              {t('ssh.checkHost')}
            </Button>
            <TextField.Description>{t('ssh.localNetworkNotice')}</TextField.Description>
          </FormField>
        ) : null}
        {hostProbe && profile ? (
          <SshHostTrustDialog
            key={hostProbe.token}
            profile={profile}
            probe={hostProbe}
            onClose={() => setHostProbe(null)}
            onConfirm={() => {
              const token = hostProbe.token;
              setHostProbe(null);
              alert.confirm({
                title: t('ssh.hostKeyChanged'),
                description: t('ssh.hostKey.confirm'),
                confirmLabel: t('ssh.trust'),
                role: 'destructive',
                onConfirm: () => {
                  void action.run(() => ssh.trust(token));
                },
              });
            }}
          />
        ) : null}
        {pickAgent && profile ? (
          <SshAgentPicker profile={profile} onClose={() => setPickAgent(false)} />
        ) : null}
      </PluginPage>
    </>
  );
}

function FormField({
  children,
  label,
  disabled,
  required,
}: {
  children: ReactNode;
  label: string;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <TextField disabled={disabled} required={required}>
      <TextField.Label>{label}</TextField.Label>
      {children}
    </TextField>
  );
}

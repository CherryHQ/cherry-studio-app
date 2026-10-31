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
import { Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { SettingsScrollPage } from '@/frontend/features/settings/components/SettingsScrollPage';
import { sshErrorLabel, useSshAction, useSshProfiles } from '@/frontend/hooks/ssh';
import { SshError, type SshCommandResult, type SshProfile } from '@/shared/data/types/ssh';

import { SshAgentPicker } from './SshAgentPicker';

export function SshProfileScreen() {
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const profiles = useSshProfiles();
  const { t } = useTranslation();
  const profile = profiles.data?.find((item) => item.id === profileId);
  return profile ? (
    <SshProfileDetail profile={profile} />
  ) : (
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
}

function SshProfileDetail({ profile }: { profile: SshProfile }) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const router = useRouter();
  const ssh = useBackendModule('ssh');
  const action = useSshAction();
  const [pickAgent, setPickAgent] = useState(false);
  async function probe() {
    const result = await action.run((signal) => ssh.probe(profile, signal));
    if (!result) return;
    alert.confirm({
      title: t(
        profile.fingerprint && profile.fingerprint !== result.fingerprint
          ? 'ssh.hostKeyChanged'
          : 'ssh.trustTitle',
      ),
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
  function remove() {
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
            if (removed) router.dismissTo('/settings/ssh');
          });
      },
    });
  }
  return (
    <SettingsScrollPage
      contentClassName="gap-5"
      keyboardShouldPersistTaps="handled"
      headerProps={{ title: profile.name }}
    >
      <Section footer={t('ssh.localNetworkNotice')}>
        <Section.Item
          label={`${profile.username}@${profile.host}:${profile.port}`}
          description={t(profile.authMethod === 'password' ? 'ssh.password' : 'ssh.privateKey')}
        />
        <Section.Item
          label={t('ssh.fingerprint')}
          description={
            <Text selectable className="font-mono text-sm text-muted-foreground">
              {profile.fingerprint ?? t('ssh.untrusted')}
            </Text>
          }
        />
        <Section.Item
          label={t('ssh.checkHost')}
          disabled={action.busy || !ssh.isAvailable()}
          onPress={() => void probe()}
        />
        <Section.Item
          label={t('ssh.edit')}
          disabled={action.busy}
          onPress={() =>
            router.push({ pathname: '/settings/ssh/edit', params: { profileId: profile.id } })
          }
        />
      </Section>
      <Button
        disabled={!profile.fingerprint || action.busy || !ssh.isAvailable()}
        variant="secondary"
        onPress={() => setPickAgent(true)}
      >
        {t('ssh.useWithAi')}
      </Button>
      <SshCommandPanel key={profile.revision} profile={profile} />
      <Section>
        <Section.Item
          label={t('common.remove')}
          disabled={action.busy}
          destructive
          onPress={remove}
        />
      </Section>
      {pickAgent ? <SshAgentPicker profile={profile} onClose={() => setPickAgent(false)} /> : null}
    </SettingsScrollPage>
  );
}

function SshCommandPanel({ profile }: { profile: SshProfile }) {
  const { t } = useTranslation();
  const ssh = useBackendModule('ssh');
  const action = useSshAction();
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState({ stdout: '', stderr: '' });
  const [result, setResult] = useState<SshCommandResult | null>(null);
  async function execute() {
    setOutput({ stdout: '', stderr: '' });
    setResult(null);
    const completed = await action.run((signal) =>
      ssh.execute(profile, command, signal, (chunk) => {
        setOutput((value) => ({ ...value, [chunk.stream]: value[chunk.stream] + chunk.text }));
      }),
    );
    if (completed) {
      setResult(completed);
      setOutput({ stdout: completed.stdout, stderr: completed.stderr });
    }
  }
  return (
    <View className="gap-4">
      <TextField>
        <TextField.Label>{t('ssh.command.label')}</TextField.Label>
        <Input
          accessibilityLabel={t('ssh.command.label')}
          value={command}
          onChangeText={setCommand}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={32768}
          editable={!action.busy}
        />
        <TextField.Description>{t('ssh.command.description')}</TextField.Description>
      </TextField>
      {action.busy ? (
        <Button variant="secondary" onPress={action.cancel}>
          {t('ssh.command.stop')}
        </Button>
      ) : (
        <Button
          disabled={!command.trim() || !profile.fingerprint || !ssh.isAvailable()}
          onPress={() => void execute()}
        >
          {t('ssh.command.run')}
        </Button>
      )}
      {result ? (
        <View className="gap-2">
          <Text className="text-sm text-foreground">
            {result.state === 'exited'
              ? t('ssh.command.exit', { code: result.exitCode })
              : t(result.state === 'unknown' ? 'ssh.command.unknown' : 'ssh.command.notStarted')}
          </Text>
          {result.error ? (
            <Text className="text-sm text-destructive">
              {sshErrorLabel(new SshError(result.error), t)}
            </Text>
          ) : null}
          {result.truncated ? (
            <Text className="text-sm text-warning">{t('ssh.command.truncated')}</Text>
          ) : null}
        </View>
      ) : null}
      {output.stdout || output.stderr ? (
        <View className="gap-3 rounded-xl bg-card p-4">
          {output.stdout ? (
            <Text selectable className="font-mono text-sm text-foreground">
              {output.stdout}
            </Text>
          ) : null}
          {output.stderr ? (
            <Text selectable className="font-mono text-sm text-destructive">
              {output.stderr}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

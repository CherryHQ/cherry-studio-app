import NetworkIcon from '@cherrystudio/app-icons/icons/network';
import { BottomSheet, Button, ContentState, Section, useAlert } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useSshAction, useSshProfiles, useSshTarget } from '@/frontend/hooks/ssh';

export function ChatInputSshTarget({
  contextId,
  onPress,
}: {
  contextId?: string;
  onPress: () => void;
}) {
  const target = useSshTarget(contextId);
  if (!target) return null;
  return (
    <View className="max-w-full self-start">
      <Button
        variant="secondary"
        size="sm"
        shape="pill"
        onPress={onPress}
        icon={<NetworkIcon className="size-4 text-foreground" />}
        testID="chat-ssh-target"
      >
        <Button.Label numberOfLines={1}>
          {`SSH · ${target.profile.username}@${target.profile.host}:${target.profile.port}`}
        </Button.Label>
      </Button>
    </View>
  );
}

export function ChatInputSshSheet({
  contextId,
  onClose,
}: {
  contextId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const router = useRouter();
  const ssh = useBackendModule('ssh');
  const profiles = useSshProfiles();
  const target = useSshTarget(contextId);
  const action = useSshAction();
  const granted = !!target?.grant;
  function changeGrant(allow: boolean) {
    if (!target) return;
    const apply = () => {
      void action.run(() => ssh.setCommandGrant(contextId, target, allow));
    };
    if (allow)
      alert.confirm({
        title: t('ssh.grant.title'),
        description: t('ssh.grant.description', {
          target: `${target.profile.username}@${target.profile.host}:${target.profile.port}`,
        }),
        confirmLabel: t('ssh.grant.allow'),
        onConfirm: apply,
      });
    else apply();
  }
  return (
    <BottomSheet
      open
      onClose={onClose}
      size="large"
      title={t('ssh.selectTarget')}
      testID="chat-ssh-picker"
      footer={
        <Button
          variant="secondary"
          onPress={() => {
            onClose();
            router.push('/settings/ssh');
          }}
        >
          {t('ssh.manage')}
        </Button>
      }
    >
      <ScrollView contentContainerClassName="gap-5 px-4 pb-6">
        <Text className="text-sm text-muted-foreground">{t('ssh.targetNotice')}</Text>
        {profiles.isLoading ? (
          <ContentState.Loading title={t('ssh.loading')} />
        ) : profiles.error ? (
          <ContentState.Error
            title={t('ssh.loadFailed')}
            primaryAction={{ children: t('common.retry'), onPress: () => void profiles.refetch() }}
          />
        ) : profiles.data?.length === 0 ? (
          <ContentState.Empty title={t('ssh.empty')} description={t('ssh.description')} />
        ) : (
          <Section>
            <Section.RadioItem
              label={t('ssh.noTarget')}
              selected={!target}
              disabled={action.busy}
              onPress={() => {
                void action.run(() => ssh.selectTarget(contextId, null));
              }}
            />
            {profiles.data?.map((profile) => (
              <Section.RadioItem
                key={profile.id}
                selected={target?.profile.id === profile.id}
                label={profile.name}
                disabled={action.busy || !profile.fingerprint}
                description={
                  profile.fingerprint
                    ? `${profile.username}@${profile.host}:${profile.port}`
                    : t('ssh.untrusted')
                }
                onPress={() => {
                  void action.run(() => ssh.selectTarget(contextId, profile));
                }}
              />
            ))}
          </Section>
        )}
        {target ? (
          <Section footer={t(granted ? 'ssh.grant.active' : 'ssh.grant.ask')}>
            <Section.SwitchItem
              label={t('ssh.grant.title')}
              value={granted}
              onValueChange={changeGrant}
              disabled={action.busy}
            />
          </Section>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

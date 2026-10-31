import { BottomSheet, Button, ContentState, Section, useAlert } from '@cherrystudio/ui/components';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useSshAction, useSshProfiles, useSshTarget } from '@/frontend/hooks/ssh';

export function SshChatControl({ sessionId, draftId }: { sessionId?: string; draftId?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const ssh = useBackendModule('ssh');
  const [pickerContext, setPickerContext] = useState<string | null>(null);
  const contextId = sessionId ?? (draftId ? `draft:${draftId}` : undefined);
  const target = useSshTarget(contextId);
  if (!ssh.isAvailable()) return null;
  function open() {
    if (contextId) setPickerContext(contextId);
    else {
      const id = randomUUID();
      router.setParams({ sshDraftId: id });
      setPickerContext(`draft:${id}`);
    }
  }
  return (
    <View className="items-start px-3 py-1">
      <Button variant="ghost" size="sm" onPress={open} accessibilityLabel={t('ssh.selectTarget')}>
        {target ? `SSH · ${target.profile.username}@${target.profile.host}` : t('ssh.selectTarget')}
      </Button>
      {pickerContext ? (
        <SshTargetPicker contextId={pickerContext} onClose={() => setPickerContext(null)} />
      ) : null}
    </View>
  );
}

function SshTargetPicker({ contextId, onClose }: { contextId: string; onClose: () => void }) {
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
    <BottomSheet open onClose={onClose} size="large" title={t('ssh.selectTarget')}>
      <ScrollView contentContainerClassName="gap-5 px-4 pb-6">
        <Text className="text-sm text-muted-foreground">{t('ssh.targetNotice')}</Text>
        {profiles.isLoading ? (
          <ContentState.Loading title={t('ssh.loading')} />
        ) : profiles.error ? (
          <ContentState.Error
            title={t('ssh.loadFailed')}
            primaryAction={{ children: t('common.retry'), onPress: () => void profiles.refetch() }}
          />
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
        <Button
          variant="secondary"
          onPress={() => {
            onClose();
            router.push('/settings/ssh');
          }}
        >
          {t('ssh.manage')}
        </Button>
      </ScrollView>
    </BottomSheet>
  );
}

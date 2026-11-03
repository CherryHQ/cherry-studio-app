import { Button, Dialog } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useSshAction } from '@/frontend/hooks/ssh';
import type { SshHostProbe } from '@/shared/contracts/ssh';
import type { SshProfile } from '@/shared/data/types/ssh';

export function SshHostTrustDialog({
  profile,
  probe,
  onClose,
}: {
  profile: SshProfile;
  probe: SshHostProbe;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ssh = useBackendModule('ssh');
  const action = useSshAction();
  const changed = Boolean(profile.fingerprint && profile.fingerprint !== probe.fingerprint);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Dialog
      open
      title={t(changed ? 'ssh.hostKeyChanged' : 'ssh.trustTitle')}
      onOpenChange={(open) => {
        if (!open && !action.busy) onClose();
      }}
    >
      <ScrollView className="max-h-96" contentContainerClassName="gap-4">
        <Text
          selectable
          className="font-mono text-sm text-foreground"
        >{`${profile.username}@${profile.host}:${profile.port}`}</Text>
        <Text className={changed ? 'text-sm text-destructive' : 'text-sm text-foreground'}>
          {t(changed ? 'ssh.hostKey.warning' : 'ssh.trustDescription', {
            target: `${profile.host}:${profile.port}`,
            fingerprint: probe.fingerprint,
          })}
        </Text>
        {changed ? (
          <View className="flex-row gap-4">
            <View className="min-w-0 flex-1 gap-2">
              <Text className="text-sm font-medium text-foreground">
                {t('ssh.hostKey.previous')}
              </Text>
              <Text selectable className="font-mono text-sm text-muted-foreground">
                {profile.fingerprint}
              </Text>
            </View>
            <View className="min-w-0 flex-1 gap-2">
              <Text className="text-sm font-medium text-destructive">{t('ssh.hostKey.new')}</Text>
              <Text selectable className="font-mono text-sm text-destructive">
                {probe.fingerprint}
              </Text>
            </View>
          </View>
        ) : null}
        {confirmed ? (
          <Text className="text-sm text-destructive">{t('ssh.hostKey.confirm')}</Text>
        ) : null}
      </ScrollView>
      <View className="gap-2 pt-4">
        <Button
          variant={changed ? 'destructive' : 'default'}
          disabled={action.busy}
          loading={action.busy}
          onPress={() => {
            if (changed && !confirmed) {
              setConfirmed(true);
              return;
            }
            void action
              .run(() => ssh.trust(probe.token))
              .then((trusted) => {
                if (trusted) onClose();
              });
          }}
        >
          {t(changed && !confirmed ? 'ssh.hostKey.reviewed' : 'ssh.trust')}
        </Button>
        <Button variant="secondary" disabled={action.busy} onPress={onClose}>
          {t('common.cancel')}
        </Button>
      </View>
    </Dialog>
  );
}

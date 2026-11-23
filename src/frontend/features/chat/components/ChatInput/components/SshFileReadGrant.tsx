import { Button, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useSshAction } from '@/frontend/hooks/ssh';
import { SshError, type SshTarget } from '@/shared/data/types/ssh';

export function SshFileReadGrant({ contextId, target }: { contextId: string; target: SshTarget }) {
  const { t } = useTranslation();
  const ssh = useBackendModule('ssh');
  const action = useSshAction();
  const [listing, setListing] = useState<{
    directory: string;
    names: string[];
    truncated: boolean;
  }>();
  const [selected, setSelected] = useState<string[]>([]);
  const { grant, profile } = target;
  const host = `${profile.username}@${profile.host}:${profile.port}`;
  if (grant) {
    return (
      <Section title={host}>
        {grant.scope !== 'diagnostics' ? (
          <Section.Item label={grant.scope.directory} description={grant.scope.files.join('\n')} />
        ) : null}
        <Section.Item
          label={t('ssh.fileGrant.revoke')}
          disabled={action.busy}
          onPress={() => void action.run(() => ssh.setGrant(contextId, target, null))}
        />
      </Section>
    );
  }

  if (!listing) {
    return (
      <Button
        variant="ghost"
        disabled={action.busy}
        onPress={() =>
          void action.run(async (signal) => {
            const result = await ssh.files(profile, { operation: 'list', path: '.' }, signal);
            signal.throwIfAborted();
            if (result.state !== 'completed' || result.error)
              throw new SshError(result.error ?? 'sftp');
            setListing({
              directory: result.path,
              names: result.entries
                .filter((entry) => entry.type === 'file')
                .map((entry) => entry.name),
              truncated: result.truncated,
            });
          })
        }
      >
        {t('ssh.fileGrant.choose')}
      </Button>
    );
  }

  return (
    <View className="gap-3">
      <Text className="text-sm text-foreground" selectable>
        {t('ssh.fileGrant.scope', { host, directory: listing.directory })}
      </Text>
      <Section>
        {listing.names.map((name) => (
          <Section.SwitchItem
            key={name}
            label={name}
            value={selected.includes(name)}
            disabled={action.busy}
            onValueChange={(on) =>
              setSelected((current) =>
                on ? [...current, name] : current.filter((item) => item !== name),
              )
            }
          />
        ))}
      </Section>
      {listing.truncated ? (
        <Text className="text-sm text-muted-foreground">{t('ssh.files.listTruncated')}</Text>
      ) : null}
      <Button
        disabled={action.busy}
        onPress={() =>
          void action.run(() =>
            ssh.setGrant(contextId, target, { directory: listing.directory, files: selected }),
          )
        }
      >
        {t('ssh.fileGrant.allow')}
      </Button>
    </View>
  );
}

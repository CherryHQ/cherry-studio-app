import { BottomSheet, ContentState, Section } from '@cherrystudio/ui/components';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { chatHref, createChatComposerHandoff } from '@/frontend/appShell/navigation/chat';
import { useBackendModule } from '@/frontend/data';
import { useAgentsApi } from '@/frontend/hooks/agent';
import { useSshAction } from '@/frontend/hooks/ssh';
import type { SshProfile } from '@/shared/data/types/ssh';

export function SshAgentPicker({ profile, onClose }: { profile: SshProfile; onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const ssh = useBackendModule('ssh');
  const agents = useAgentsApi();
  const action = useSshAction();
  const available = agents.agents.filter((agent) => agent.mode === 'standard');
  async function select(agentId: string) {
    const draftId = randomUUID();
    const selected = await action.run(async () => {
      await ssh.selectTarget(`draft:${draftId}`, profile);
      return true;
    });
    if (!selected) return;
    onClose();
    router.push(
      chatHref({
        kind: 'draft',
        agentId,
        sshDraftId: draftId,
        composerHandoff: createChatComposerHandoff({ draft: '', attachments: [] }),
      }),
    );
  }
  return (
    <BottomSheet open onClose={onClose} size="medium" title={t('ssh.useWithAi')}>
      {agents.isLoading ? (
        <ContentState.Loading title={t('ssh.loading')} />
      ) : agents.error ? (
        <ContentState.Error
          title={t('ssh.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void agents.refetch() }}
        />
      ) : available.length ? (
        <ScrollView contentContainerClassName="px-4 pb-6">
          <Section>
            {available.map((agent) => (
              <Section.Item
                key={agent.id}
                label={agent.name}
                disabled={action.busy}
                onPress={() => void select(agent.id)}
              />
            ))}
          </Section>
        </ScrollView>
      ) : (
        <ContentState.Empty title={t('ssh.noAgents')} />
      )}
    </BottomSheet>
  );
}

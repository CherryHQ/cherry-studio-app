import { ContentState } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { AgentPickerSheet } from '@/frontend/components/AgentPicker';
import { useAgentsApi } from '@/frontend/hooks/agent';

export function SshAgentPicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (agentId: string) => void;
}) {
  const { t } = useTranslation();
  const agents = useAgentsApi();
  const available = agents.agents.filter((agent) => agent.mode === 'standard');
  return (
    <AgentPickerSheet
      catalog={{
        items: available.map((agent) => ({
          ...agent,
          configuration: agent.model ? ('available' as const) : ('unavailable' as const),
        })),
        isLoading: agents.isLoading,
        isError: !!agents.error,
        refetch: agents.refetch,
      }}
      emptyState={<ContentState.Empty title={t('ssh.noAgents')} />}
      onClose={onClose}
      onSelect={onSelect}
      open
      testID="ssh-agent-picker"
      title={t('ssh.useWithAi')}
    />
  );
}

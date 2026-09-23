import BotIcon from '@cherrystudio/app-icons/icons/bot';
import { Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { AgentCapability } from '@/shared/data/types/agentCapability';

import { setAgentCapabilityEnabled } from '../agentForm';

type AgentBuiltInToolsSectionProps = {
  disabledCapabilities: readonly AgentCapability[];
  onChange: (disabledCapabilities: AgentCapability[]) => void;
};

/** App-owned tool groups that need no system permission. */
export function AgentBuiltInToolsSection({
  disabledCapabilities,
  onChange,
}: AgentBuiltInToolsSectionProps) {
  const { t } = useTranslation();
  return (
    <View className="gap-2">
      <Text className="px-1 font-medium text-muted-foreground text-sm">
        {t('agent.builtInTools.section')}
      </Text>
      <Section>
        <Section.SwitchItem
          density="compact"
          description={t('agent.capabilities.agents.description')}
          label={t('agent.capabilities.agents.label')}
          leading={<BotIcon className="size-5 text-foreground" />}
          onValueChange={(enabled) =>
            onChange(setAgentCapabilityEnabled(disabledCapabilities, 'agents', enabled))
          }
          value={!disabledCapabilities.includes('agents')}
        />
      </Section>
    </View>
  );
}

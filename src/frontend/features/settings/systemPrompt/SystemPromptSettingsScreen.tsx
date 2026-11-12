import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { usePreference } from '@/frontend/data/hooks';
import {
  AGENT_SYSTEM_PROMPT_PREFERENCES,
  type AgentSystemPromptId,
} from '@/shared/data/types/agentSystemPrompt';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { SYSTEM_PROMPT_OPTIONS } from './systemPromptOptions';

export function SystemPromptSettingsScreen() {
  const { t } = useTranslation();

  return (
    <SettingsScrollPage
      contentClassName="gap-6"
      headerProps={{ title: t('settings.systemPrompt.title') }}
    >
      <Text className="px-1 text-muted-foreground text-sm">
        {t('settings.systemPrompt.description')}
      </Text>
      <Section>
        {SYSTEM_PROMPT_OPTIONS.map((option) => (
          <SystemPromptRow id={option.id} key={option.id} titleKey={option.titleKey} />
        ))}
      </Section>
    </SettingsScrollPage>
  );
}

function SystemPromptRow({ id, titleKey }: { id: AgentSystemPromptId; titleKey: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [value] = usePreference(AGENT_SYSTEM_PROMPT_PREFERENCES[id]);

  return (
    <Section.SelectItem
      label={t(titleKey)}
      onPress={() =>
        router.push({ pathname: '/settings/system-prompt/[promptId]', params: { promptId: id } })
      }
      testID={`system-prompt-${id}`}
      value={t(value === null ? 'settings.systemPrompt.default' : 'settings.systemPrompt.custom')}
    />
  );
}

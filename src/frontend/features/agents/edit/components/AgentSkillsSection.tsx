import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { AgentSkillUpdate } from '@/shared/data/api/schemas/skills';
import type { SkillListItem } from '@/shared/data/types/skill';

type AgentSkillsSectionProps = {
  /** Keeps "Add in chat" from the Skill library on this Agent. */
  agentId?: string;
  skills: readonly SkillListItem[];
  /** Draft binding state keyed by Skill id; absent means unbound. */
  bindings: ReadonlyMap<string, boolean>;
  onChange: (updates: AgentSkillUpdate[]) => void;
};

/**
 * Per-Agent Skill bindings. The switch expresses the user's intent; the caption
 * reports a missing package. Installation and updates live in the Skill library,
 * linked from the footer.
 */
export function AgentSkillsSection({
  agentId,
  bindings,
  onChange,
  skills,
}: AgentSkillsSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Section footer={t('agent.skills.usageHint')} title={t('agent.skills.section')}>
      {skills.map((skill) => {
        const isEnabled = bindings.get(skill.id) === true;
        return (
          <Section.SwitchItem
            accessibilityLabel={skill.name}
            description={
              <View className="gap-0.5">
                <Text className="text-sm text-muted-foreground" numberOfLines={2}>
                  {skill.description}
                </Text>
                {skill.isPackageMissing ? (
                  <Text className="text-warning text-xs">{t('skills.packageMissing')}</Text>
                ) : null}
              </View>
            }
            key={skill.id}
            label={skill.name}
            onValueChange={(value) => onChange([{ isEnabled: value, skillId: skill.id }])}
            value={isEnabled}
          />
        );
      })}
      <Section.Item
        label={skills.length === 0 ? t('agent.skills.manageEmpty') : t('agent.skills.manage')}
        onPress={() => router.push({ pathname: '/skills', params: { agentId } })}
        trailing={<ChevronRightIcon className="size-5 text-muted-foreground" />}
      />
    </Section>
  );
}

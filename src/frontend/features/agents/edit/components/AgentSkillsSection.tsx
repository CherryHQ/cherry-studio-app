import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { AgentSkillUpdate } from '@/shared/data/api/schemas/skills';
import type { SkillListItem } from '@/shared/data/types/skill';

import { effectiveSkillStatus, mergeSkillReasons } from '../agentSkillSettings';

type AgentSkillsSectionProps = {
  agentId?: string;
  skills: readonly SkillListItem[];
  /** Draft binding state keyed by Skill id; absent means unbound. */
  bindings: ReadonlyMap<string, boolean>;
  onChange: (updates: AgentSkillUpdate[]) => void;
};

/**
 * Per-Agent Skill bindings. The switch expresses the user's intent; the caption
 * explains why a bound Skill cannot currently be used by this Agent. Installing
 * and global enablement live in Plugins, linked from the footer.
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
    <View className="gap-2">
      <Text className="px-1 font-medium text-muted-foreground text-sm">
        {t('agent.skills.section')}
      </Text>
      <Section>
        {skills.map((skill) => {
          const isEnabled = bindings.get(skill.id) === true;
          const status = effectiveSkillStatus(skill.admission, skill.agentAdmission);
          const reasons = mergeSkillReasons(skill.admission, skill.agentAdmission);
          const caption = !skill.isGlobalEnabled
            ? t('agent.skills.globallyDisabled')
            : status === 'ready' || reasons.length === 0
              ? undefined
              : t(`skills.reason.${reasons[0]!.code}`, { subject: reasons[0]!.subject ?? '' });
          return (
            <Section.SwitchItem
              accessibilityLabel={`${skill.name}, ${t(`skills.status.${status}`)}`}
              description={
                <View className="gap-0.5">
                  <Text className="text-sm text-muted-foreground" numberOfLines={2}>
                    {skill.description}
                  </Text>
                  {caption ? (
                    <Text
                      className={`text-xs ${status === 'unsupported' ? 'text-error' : 'text-muted-foreground'}`}
                    >
                      {caption}
                    </Text>
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
          onPress={() => router.push({ pathname: '/plugins', params: { tab: 'skills', agentId } })}
          trailing={<ChevronRightIcon className="size-5 text-muted-foreground" />}
        />
      </Section>
    </View>
  );
}

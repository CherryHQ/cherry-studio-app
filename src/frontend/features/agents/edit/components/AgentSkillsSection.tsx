import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import TrashIcon from '@cherrystudio/app-icons/icons/trash-2';
import { BottomSheet, Button, Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, ScrollView, Text, View } from 'react-native';

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
 * Only enabled bindings appear in the editor. Adding an installed Skill is a
 * separate choice; installation and updates remain in the Skill library.
 */
export function AgentSkillsSection({
  agentId,
  bindings,
  onChange,
  skills,
}: AgentSkillsSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [isAdding, setIsAdding] = useState(false);
  const enabledSkills = skills.filter((skill) => bindings.get(skill.id) === true);
  const availableSkills = skills.filter(
    (skill) => bindings.get(skill.id) !== true && skill.isEnabled && !skill.isPackageMissing,
  );

  return (
    <>
      <Section
        footer={enabledSkills.length > 0 ? t('agent.skills.usageHint') : undefined}
        title={enabledSkills.length > 0 ? t('agent.skills.section') : undefined}
      >
        {enabledSkills.map((skill) => (
          <Section.Item
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
            trailing={
              <Button
                accessibilityLabel={t('agent.skills.removeAccessibilityLabel', {
                  name: skill.name,
                })}
                icon={<TrashIcon />}
                onPress={() => onChange([{ isEnabled: null, skillId: skill.id }])}
                size="xs"
                variant="ghost"
              />
            }
          />
        ))}
        <Section.Item
          label={t('agent.skills.add')}
          onPress={() => {
            Keyboard.dismiss();
            setIsAdding(true);
          }}
        />
      </Section>
      <BottomSheet
        onClose={() => setIsAdding(false)}
        open={isAdding}
        size="medium"
        title={t('agent.skills.add')}
      >
        <ScrollView contentContainerClassName="pt-2" showsVerticalScrollIndicator={false}>
          <Section variant="plain">
            {availableSkills.map((skill) => (
              <Section.Item
                description={skill.description}
                key={skill.id}
                label={skill.name}
                onPress={() => {
                  onChange([{ isEnabled: true, skillId: skill.id }]);
                  setIsAdding(false);
                }}
                showChevron={false}
              />
            ))}
            <Section.Item
              label={skills.length === 0 ? t('agent.skills.manageEmpty') : t('agent.skills.manage')}
              onPress={() => {
                setIsAdding(false);
                router.push({ pathname: '/skills', params: { agentId } });
              }}
              trailing={<ChevronRightIcon className="size-5 text-muted-foreground" />}
            />
          </Section>
        </ScrollView>
      </BottomSheet>
    </>
  );
}

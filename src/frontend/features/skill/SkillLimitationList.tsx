import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { SkillLimitations } from '@/shared/data/types/skill';

/** States what the app does not provide for a package; it never judges whether the Skill is usable. */
export function SkillLimitationList({ limitations }: { limitations: SkillLimitations }) {
  const { t } = useTranslation();
  const { scripts, unavailableTools } = limitations;
  return (
    <>
      {scripts.length > 0 ? (
        <Text className="text-sm text-muted-foreground">
          {t('skills.limitation.scripts', { count: scripts.length })}
        </Text>
      ) : null}
      {unavailableTools.length > 0 ? (
        <Text className="text-sm text-muted-foreground" selectable>
          {t('skills.limitation.tools', { tools: unavailableTools.join(', ') })}
        </Text>
      ) : null}
    </>
  );
}

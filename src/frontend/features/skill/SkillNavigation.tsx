import { Tabs } from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

type SkillTab = 'library' | 'discover';

/** Switches tabs in place, keeping the chat context the library was opened from. */
export function useSkillTabNavigation() {
  const router = useRouter();
  const params = useLocalSearchParams();
  return (tab: SkillTab) =>
    router.replace({ pathname: tab === 'library' ? '/skills' : '/skills/discover', params });
}

export function SkillNavigation({ value }: { value: SkillTab }) {
  const { t } = useTranslation();
  const navigate = useSkillTabNavigation();
  return (
    <Tabs
      items={[
        { value: 'library', label: t('skills.library'), testID: 'skills-tab-library' },
        { value: 'discover', label: t('skills.discover.tab'), testID: 'skills-tab-discover' },
      ]}
      onValueChange={navigate}
      value={value}
    />
  );
}

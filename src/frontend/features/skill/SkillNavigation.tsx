import { Tabs } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export function SkillNavigation({ value }: { value: 'library' | 'discover' }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Tabs
      items={[
        { value: 'library', label: t('skills.library'), testID: 'skills-tab-library' },
        { value: 'discover', label: t('skills.discover.tab'), testID: 'skills-tab-discover' },
      ]}
      onValueChange={(next) => router.replace(next === 'library' ? '/skills' : '/skills/discover')}
      value={value}
    />
  );
}

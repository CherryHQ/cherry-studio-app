import { Tabs } from '@cherrystudio/ui/components';

import type { AppSearchFilterProps } from '@/frontend/appShell/search';

import type { SkillDiscoverySource } from './skillDiscovery';

export function SkillSourceFilter({
  value,
  onChange,
}: AppSearchFilterProps<SkillDiscoverySource, undefined>) {
  return (
    <Tabs
      items={[
        { value: 'cherryin', label: 'CherryIN' },
        { value: 'skills-sh', label: 'skills.sh' },
      ]}
      layout="hug"
      onValueChange={onChange}
      value={value}
    />
  );
}

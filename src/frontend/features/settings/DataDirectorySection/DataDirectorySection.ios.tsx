import { Trash2Icon } from '@cherrystudio/app-icons';
import { Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { DataDirectorySectionProps } from './DataDirectorySection.types';

export function DataDirectorySection({ onClearCache }: DataDirectorySectionProps) {
  const { t } = useTranslation();

  return (
    <Section title={t('settings.data.directory.title')}>
      <Section.Item
        label={t('settings.data.clearCache.title')}
        leading={<Trash2Icon className="size-5 text-foreground" />}
        onPress={onClearCache}
        showChevron={false}
      />
    </Section>
  );
}

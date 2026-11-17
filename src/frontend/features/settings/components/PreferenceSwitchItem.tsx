import { Section, useToast, type SectionItemPressProps } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data/hooks';
import type {
  PreferenceKeyType,
  PreferenceSchema,
  PreferenceUpdateOptions,
} from '@/shared/data/preference';

type BooleanPreferenceKey = {
  [K in PreferenceKeyType]: PreferenceSchema[K] extends boolean ? K : never;
}[PreferenceKeyType];

/** Each setting keeps its persistence policy while sharing save state and failure feedback. */
export function PreferenceSwitchItem({
  preferenceKey,
  labelKey,
  failedKey,
  options,
  testID,
  ...pressProps
}: SectionItemPressProps & {
  preferenceKey: BooleanPreferenceKey;
  labelKey: string;
  failedKey: string;
  options?: PreferenceUpdateOptions;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [value, setValue] = usePreference(preferenceKey);
  const [isSaving, setIsSaving] = useState(false);
  const change = async (next: boolean) => {
    setIsSaving(true);
    try {
      await setValue(next, options);
    } catch {
      toast.show({ label: t(failedKey), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <Section.SwitchItem
      {...pressProps}
      disabled={isSaving}
      label={t(labelKey)}
      onValueChange={(next) => void change(next)}
      testID={testID}
      value={value}
    />
  );
}
PreferenceSwitchItem.sectionItem = true as const;

import { OptionPickerBottomSheet, Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data/hooks';
import type { ModelWebToolsPreference } from '@/shared/data/preference';

const optionKeys = {
  preferred: 'settings.websearch.source.preferred',
  fallback: 'settings.websearch.source.fallback',
  disabled: 'settings.websearch.source.disabled',
} as const satisfies Record<ModelWebToolsPreference, string>;
const choices: readonly ModelWebToolsPreference[] = ['preferred', 'fallback', 'disabled'];

/** The two web tool pages edit the same global source preference. */
export function WebSearchSourceSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [modelTools, setModelTools] = usePreference('chat.web_search.model_tools');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const description = t('settings.websearch.source.description');
  const options = choices.map((value) => ({
    value,
    label: t(optionKeys[value]),
  }));
  const changeModelTools = (value: ModelWebToolsPreference) => {
    void setModelTools(value).catch(() => {
      toast.show({ label: t('settings.websearch.provider.saveFailed'), variant: 'danger' });
    });
  };

  return (
    <>
      <Section footer={description}>
        <Section.SelectItem
          label={t('settings.websearch.source.label')}
          onPress={() => setIsPickerOpen(true)}
          value={t(optionKeys[modelTools])}
        />
      </Section>
      <OptionPickerBottomSheet<ModelWebToolsPreference>
        onClose={() => setIsPickerOpen(false)}
        onValueChange={changeModelTools}
        open={isPickerOpen}
        options={options}
        selectedValue={modelTools}
        size="compact"
        testID="web-search-source-picker"
        title={t('settings.websearch.source.label')}
      />
    </>
  );
}

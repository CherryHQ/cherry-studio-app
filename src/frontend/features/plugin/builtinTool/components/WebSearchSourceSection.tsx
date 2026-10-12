import { OptionPickerBottomSheet, Section } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data/hooks';

/** The two web tool pages edit the same global source preference. */
export function WebSearchSourceSection() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [modelPreferred, setModelPreferred] = usePreference(
    'chat.web_search.model_tools_preferred',
  );
  const options = [
    { value: 'model', label: t('settings.websearch.source.model') },
    { value: 'configured', label: t('settings.websearch.source.configured') },
  ];
  return (
    <>
      <Section footer={t('settings.websearch.source.description')}>
        <Section.SelectItem
          label={t('settings.websearch.source.title')}
          value={modelPreferred ? options[0].label : options[1].label}
          onPress={() => setOpen(true)}
        />
      </Section>
      <OptionPickerBottomSheet
        open={open}
        onClose={() => setOpen(false)}
        onValueChange={(value) => {
          void setModelPreferred(value === 'model');
        }}
        options={options}
        selectedValue={modelPreferred ? 'model' : 'configured'}
        size="compact"
        title={t('settings.websearch.source.title')}
      />
    </>
  );
}

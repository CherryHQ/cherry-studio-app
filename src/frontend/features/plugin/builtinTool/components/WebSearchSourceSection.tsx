import { Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data/hooks';

/** The two web tool pages edit the same global source preference. */
export function WebSearchSourceSection() {
  const { t } = useTranslation();
  const [modelPreferred, setModelPreferred] = usePreference(
    'chat.web_search.model_tools_preferred',
  );
  return (
    <Section footer={t('settings.websearch.source.description')}>
      <Section.SwitchItem
        label={t('settings.websearch.source.model')}
        onValueChange={(value) => {
          void setModelPreferred(value);
        }}
        value={modelPreferred}
      />
    </Section>
  );
}

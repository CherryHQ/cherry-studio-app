import { Section, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data';

export function DeepseekSafetySetting() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [enabled, setEnabled] = usePreference('chat.deepseek.safety_check');
  return (
    <Section>
      <Section.SwitchItem
        description={t('deepseek.safetyCheckDescription')}
        label={t('deepseek.safetyCheck')}
        onValueChange={(value) => {
          void setEnabled(value).catch(() =>
            toast.show({ label: t('settings.provider.apiService.saveFailed'), variant: 'danger' }),
          );
        }}
        value={enabled}
      />
    </Section>
  );
}

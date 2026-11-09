import { Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data/hooks';

export function CacheHitRateSetting() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isCacheHitRateEnabled, setIsCacheHitRateEnabled] = usePreference(
    'chat.cache_hit_rate.enabled',
  );

  const changeCacheHitRate = async (value: boolean) => {
    setIsSaving(true);
    try {
      await setIsCacheHitRateEnabled(value);
    } catch {
      toast.show({ label: t('settings.cacheHitRate.saveFailed'), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Section.SwitchItem
      description={t('settings.cacheHitRate.description')}
      disabled={isSaving}
      label={t('settings.cacheHitRate.title')}
      onValueChange={(value) => {
        void changeCacheHitRate(value);
      }}
      testID="settings-cache-hit-rate"
      value={isCacheHitRateEnabled}
    />
  );
}

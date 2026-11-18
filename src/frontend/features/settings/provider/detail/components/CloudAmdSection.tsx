import { Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { CloudAmdAction } from '@/frontend/appShell/cloud';
import type { CloudAmdState, CloudModule } from '@/shared/contracts/cloud';

export function CloudAmdSection({ amd, cloud }: { amd?: CloudAmdState; cloud: CloudModule }) {
  const { t } = useTranslation();
  if (!amd || amd.phase === 'loading') return null;

  return (
    <Section title={t('cloud.amd.title')}>
      {amd.phase === 'ready' ? (
        <CloudAmdAction cloud={cloud} status={amd.status} />
      ) : (
        <Section.Item
          description={t('chat.errorPart.reason.providerUnavailable')}
          label={t('common.retry')}
          onPress={() => void cloud.refreshAmd()}
        />
      )}
    </Section>
  );
}

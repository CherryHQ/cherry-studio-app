import { Button } from '@cherrystudio/ui/components';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

import { useCherryInOauth } from '../hooks/useCherryInOauth';
import { ProviderOauthSectionView } from './ProviderOauthSection';

const CHERRYIN_TOPUP_URL = 'https://open.cherryin.ai/console/topup';

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return `$${value.toFixed(2)}`;
}

export function CherryInOauth({ provider }: { provider: Provider }) {
  const { t } = useTranslation();
  const oauth = useCherryInOauth(provider.id);
  const handleTopup = useCallback(() => void openExternalUrl(CHERRYIN_TOPUP_URL), []);

  const authenticatedContent = (
    <Button onPress={handleTopup} size="sm">
      {t('settings.provider.oauth.cherryIn.topup')}
    </Button>
  );
  const identityDetail = (
    <Text className="text-sm text-secondary-foreground">
      {`${t('settings.provider.oauth.cherryIn.balance')}: ${formatCurrency(oauth.balance)}`}
    </Text>
  );
  return (
    <ProviderOauthSectionView
      authenticatedContent={authenticatedContent}
      identityDetail={identityDetail}
      oauth={oauth}
      provider={provider}
    />
  );
}

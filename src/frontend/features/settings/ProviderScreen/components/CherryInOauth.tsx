import { Button } from '@cherrystudio/ui/components';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { WalletIcon } from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

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
    <View className="flex-row flex-wrap gap-2">
      <Button
        disabled={oauth.isLoadingData}
        onPress={() => void oauth.fetchData()}
        size="sm"
        variant="ghost"
      >
        <Button.Label>
          {`${t('settings.provider.oauth.cherryIn.balance')}: ${formatCurrency(oauth.balance)}`}
        </Button.Label>
      </Button>
      <Button icon={<WalletIcon />} onPress={handleTopup} size="sm">
        {t('settings.provider.oauth.cherryIn.topup')}
      </Button>
    </View>
  );
  const footer = (
    <Text
      accessibilityRole="link"
      className="px-3 text-foreground-tertiary text-xs underline"
      onPress={() => void openExternalUrl('https://open.cherryin.ai')}
    >
      {t('settings.provider.oauth.cherryIn.service_attribution')}
    </Text>
  );

  return (
    <ProviderOauthSectionView
      authenticatedContent={authenticatedContent}
      footer={footer}
      oauth={oauth}
      provider={provider}
    />
  );
}

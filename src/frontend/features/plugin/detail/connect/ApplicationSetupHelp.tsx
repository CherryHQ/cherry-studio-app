import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import { Button, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { PluginInteractiveMethod } from '@/shared/data/types/plugin';

/** Keeps provider configuration details available without crowding the connection form. */
export function ApplicationSetupHelp({
  setup,
  textKey,
  managementUrl,
}: {
  setup: NonNullable<PluginInteractiveMethod['applicationSetup']>;
  textKey: string;
  managementUrl: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);

  async function copyRedirect(url: string) {
    try {
      await Clipboard.setStringAsync(url);
      toast.show({ label: t('plugins.authorization.redirectCopied'), variant: 'success' });
    } catch {
      toast.show({ label: t('plugins.authorization.copyFailed'), variant: 'danger' });
    }
  }

  return (
    <View className="gap-3">
      <Button
        variant="ghost"
        accessibilityState={{ expanded: isExpanded }}
        onPress={() => setIsExpanded((previous) => !previous)}
        testID="plugin-application-settings"
      >
        {t(
          isExpanded
            ? 'plugins.authorization.hideApplicationSettings'
            : 'plugins.authorization.applicationSettings',
        )}
      </Button>
      {isExpanded ? (
        <View className="gap-3">
          <Text className="text-sm text-muted-foreground">
            {t(`${textKey}.applicationSettings`)}
          </Text>
          {setup.redirectUrls.map((url) => (
            <Button
              key={url}
              variant="ghost"
              size="sm"
              icon={<CopyIcon />}
              accessibilityLabel={t('plugins.authorization.copyRedirect', { url })}
              onPress={() => void copyRedirect(url)}
            >
              {url}
            </Button>
          ))}
          <Text className="text-sm text-muted-foreground">{t(`${textKey}.applicationScopes`)}</Text>
          <Text className="text-sm text-foreground">{setup.scopes.join(', ')}</Text>
          <Text className="text-sm text-muted-foreground">
            {t(`${textKey}.applicationCompatibility`)}
          </Text>
          <Button variant="link" onPress={() => void openExternalUrl(managementUrl)}>
            {t(`${textKey}.manageApplications`)}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

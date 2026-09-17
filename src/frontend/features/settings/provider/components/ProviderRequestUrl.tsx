import { Button, useToast } from '@cherrystudio/ui/components';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

export function ProviderRequestUrl({
  url,
  label,
  disabled = false,
}: {
  url: string;
  label?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const title = label ?? t('settings.provider.apiService.requestUrl');

  async function copyUrl() {
    try {
      await Clipboard.setStringAsync(url);
      toast.show({ label: t('settings.provider.apiService.urlCopied'), variant: 'success' });
    } catch {
      toast.show({ label: t('settings.provider.apiService.urlCopyFailed'), variant: 'danger' });
    }
  }

  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-muted-foreground text-xs">{title}</Text>
        <Button
          accessibilityLabel={t('settings.provider.apiService.copyUrl', { label: title })}
          disabled={disabled}
          onPress={() => void copyUrl()}
          size="inline"
          variant="link"
        >
          {t('common.copy')}
        </Button>
      </View>
      <Text className="font-mono text-muted-foreground text-xs">{url}</Text>
    </View>
  );
}

import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import { BottomSheet, Button } from '@cherrystudio/ui/components';
import type { PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export function ShareSheet({
  children,
  height = 748,
  formatControls,
  isPending,
  canShare = true,
  onClose,
  onSave,
  saveLabel,
  onShare,
}: PropsWithChildren<{
  height?: number;
  formatControls?: ReactNode;
  isPending: boolean;
  canShare?: boolean;
  onClose(): void;
  onSave?: () => void;
  saveLabel?: string;
  onShare(): void;
}>) {
  const { t } = useTranslation();
  return (
    <BottomSheet
      open
      onClose={onClose}
      height={height}
      footer={
        <View className="flex-row items-center gap-3">
          {onSave ? (
            <Button
              accessibilityLabel={saveLabel ?? t('common.save')}
              disabled={isPending || !canShare}
              icon={<DownloadIcon />}
              onPress={onSave}
              size="footer"
              variant="tonal"
            >
              {saveLabel ?? t('common.save')}
            </Button>
          ) : null}
          <View className="flex-1">
            <Button
              disabled={isPending || !canShare}
              loading={isPending}
              onPress={onShare}
              size="footer"
            >
              {t('common.share')}
            </Button>
          </View>
        </View>
      }
    >
      <View className="min-h-0 flex-1">
        <View className="min-h-0 flex-1">{children}</View>
        {formatControls ? (
          <View className="pt-3 pb-3.5" pointerEvents="box-none">
            {formatControls}
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

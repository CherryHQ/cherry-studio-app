import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import { BottomSheet, Button } from '@cherrystudio/ui/components';
import type { PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export function ShareSheet({
  children,
  headerAction,
  isPending,
  canShare = true,
  onClose,
  onSave,
  saveLabel,
  onShare,
}: PropsWithChildren<{
  headerAction?: ReactNode;
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
      sizes={['large', 'full']}
      title={t('common.share')}
      headerAction={headerAction}
      footer={
        <View className="flex-row items-center gap-3">
          {onSave ? (
            <Button
              accessibilityLabel={saveLabel ?? t('common.save')}
              disabled={isPending || !canShare}
              icon={<DownloadIcon />}
              onPress={onSave}
              size="lg"
              variant="secondary"
            />
          ) : null}
          <View className="flex-1">
            <Button
              disabled={isPending || !canShare}
              loading={isPending}
              onPress={onShare}
              size="lg"
            >
              {t('common.share')}
            </Button>
          </View>
        </View>
      }
    >
      {children}
    </BottomSheet>
  );
}

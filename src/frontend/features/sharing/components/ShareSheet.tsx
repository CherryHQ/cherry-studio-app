import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import { BottomSheet, Button } from '@cherrystudio/ui/components';
import MaskedView from '@react-native-masked-view/masked-view';
import type { PropsWithChildren, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

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
  const mask = useThemeColor('constant-black');
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
        {children}
        {formatControls ? (
          <>
            <View className="absolute right-0 bottom-0 left-0 h-[90px]" pointerEvents="none">
              <MaskedView
                style={{ flex: 1 }}
                maskElement={
                  <View
                    className="flex-1"
                    style={{
                      experimental_backgroundImage: `linear-gradient(to bottom, transparent, ${mask} 80%)`,
                    }}
                  />
                }
              >
                <View className="flex-1 bg-background dark:bg-popover">
                  <View className="absolute inset-0 dark:bg-secondary" />
                </View>
              </MaskedView>
            </View>
            <View className="absolute right-0 bottom-3.5 left-0" pointerEvents="box-none">
              {formatControls}
            </View>
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

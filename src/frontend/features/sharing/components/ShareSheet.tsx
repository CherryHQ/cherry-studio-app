import DownloadIcon from '@cherrystudio/app-icons/icons/download';
import { BottomSheet, Button } from '@cherrystudio/ui/components';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurTargetView, BlurView } from 'expo-blur';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type ViewInstance } from 'react-native';
import { useUniwind } from 'uniwind';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

const MIN_PREVIEW_BOTTOM_INSET = 96;
const BLUR_BANDS = [
  { ratio: 1, intensity: 1 },
  { ratio: 0.72, intensity: 3 },
  { ratio: 0.46, intensity: 6 },
  { ratio: 0.22, intensity: 9 },
];

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
}: {
  children(bottomInset: number): ReactNode;
  height?: number;
  formatControls?: ReactNode;
  isPending: boolean;
  canShare?: boolean;
  onClose(): void;
  onSave?: () => void;
  saveLabel?: string;
  onShare(): void;
}) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const mask = useThemeColor('constant-black');
  const blurTarget = useRef<ViewInstance>(null);
  const [controlsHeight, setControlsHeight] = useState(0);
  const bottomInset = formatControls ? Math.max(MIN_PREVIEW_BOTTOM_INSET, controlsHeight + 24) : 0;
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
        <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
          {children(bottomInset)}
        </BlurTargetView>
        {formatControls ? (
          <>
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bottomInset }}
            >
              {/* Keep the blur outside the mask: iOS masked effects lose their backdrop. */}
              {BLUR_BANDS.map(({ ratio, intensity }) => (
                <BlurView
                  key={ratio}
                  blurTarget={blurTarget}
                  blurMethod="dimezisBlurViewSdk31Plus"
                  intensity={intensity}
                  tint={
                    theme === 'dark'
                      ? 'systemUltraThinMaterialDark'
                      : 'systemUltraThinMaterialLight'
                  }
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: bottomInset * ratio,
                  }}
                />
              ))}
              <MaskedView
                style={StyleSheet.absoluteFill}
                maskElement={
                  <View
                    className="flex-1"
                    style={{
                      experimental_backgroundImage: `linear-gradient(to bottom, transparent, ${mask} 72%)`,
                    }}
                  />
                }
              >
                <View className="flex-1 bg-background/35 dark:bg-popover/35" />
              </MaskedView>
            </View>
            <View
              className="absolute right-0 bottom-0 left-0 pt-3 pb-3.5"
              pointerEvents="box-none"
              onLayout={({ nativeEvent }) => setControlsHeight(nativeEvent.layout.height)}
            >
              {formatControls}
            </View>
          </>
        ) : null}
      </View>
    </BottomSheet>
  );
}

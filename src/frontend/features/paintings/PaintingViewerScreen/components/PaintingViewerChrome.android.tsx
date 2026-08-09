import { DropdownMenu } from '@cherrystudio/ui/components';
import { Stack } from 'expo-router';
import { DownloadIcon, EllipsisIcon, PencilIcon, ProportionsIcon, XIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderIconButton } from '@/frontend/components/headers/components/HeaderIconButton';

import type { PaintingViewerChromeProps } from './PaintingViewerChrome.types';

// Android has no native bottom-header slot, so the top row goes through the
// transparent Stack header (headerLeft/headerRight) and the bottom actions are a
// custom overlay bar, mirroring SelectionToolbar.android.
export function PaintingViewerChrome({
  aspectRatios,
  onClose,
  onDelete,
  onDownload,
  onEdit,
  onResizeSelect,
  onViewConversation,
}: PaintingViewerChromeProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <HeaderIconButton accessibilityLabel={t('painting.viewer.close')} onPress={onClose}>
              <XIcon className="size-6 text-constant-white" strokeWidth={2} />
            </HeaderIconButton>
          ),
          headerRight: () => (
            <View className="flex-row items-center gap-1">
              <HeaderIconButton
                accessibilityLabel={t('painting.viewer.download')}
                onPress={onDownload}
              >
                <DownloadIcon className="size-6 text-constant-white" strokeWidth={2} />
              </HeaderIconButton>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  <View
                    accessibilityLabel={t('painting.viewer.more')}
                    accessibilityRole="button"
                    className="size-9 items-center justify-center"
                  >
                    <EllipsisIcon className="size-6 text-constant-white" strokeWidth={2} />
                  </View>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                  <DropdownMenu.Item key="view-conversation" onSelect={onViewConversation}>
                    <DropdownMenu.ItemTitle>
                      {t('painting.viewer.viewConversation')}
                    </DropdownMenu.ItemTitle>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item destructive key="delete" onSelect={onDelete}>
                    <DropdownMenu.ItemTitle>{t('painting.viewer.delete')}</DropdownMenu.ItemTitle>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </View>
          ),
        }}
      />
      <View
        className="absolute inset-x-0 flex-row items-center justify-start gap-2 pl-2"
        pointerEvents="box-none"
        style={[styles.bottomBar, { bottom: Math.max(insets.bottom, 12) + 12 }]}
      >
        <HeaderIconButton accessibilityLabel={t('painting.viewer.edit')} onPress={onEdit}>
          <PencilIcon className="size-6 text-constant-white" strokeWidth={2} />
        </HeaderIconButton>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <View
              accessibilityLabel={t('painting.viewer.resize')}
              accessibilityRole="button"
              className="size-9 items-center justify-center"
            >
              <ProportionsIcon className="size-6 text-constant-white" strokeWidth={2} />
            </View>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            {aspectRatios.map((ratio) => (
              <DropdownMenu.Item key={ratio} onSelect={() => onResizeSelect(ratio)}>
                <DropdownMenu.ItemTitle>{ratio}</DropdownMenu.ItemTitle>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    zIndex: 20,
  },
});

/* oxlint-disable react/style-prop-object -- Expo StatusBar style is a string union. */
import ArrowLeftIcon from '@cherrystudio/app-icons/icons/arrow-left';
import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import { ActionMenu, Button, Image } from '@cherrystudio/ui/components';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderIconButton } from '@/frontend/appShell/header';
import { useComposerActions } from '@/frontend/components/Composer';
import { usePaintingReferenceSelection } from '@/frontend/components/PaintingInput';

import { createPaintingOutputAttachmentDraft } from '../utils/paintingOutputAttachment';

export type PaintingComparisonImage = {
  output: { fileEntryId: string; uri: string };
  versionNumber: number;
  candidateNumber: number;
};

export function PaintingComparison({
  images,
  initialOutput,
  onClose,
  onEdit,
}: {
  images: readonly PaintingComparisonImage[];
  initialOutput: string;
  onClose: () => void;
  onEdit: (output: { fileEntryId: string; uri: string }) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reference = usePaintingReferenceSelection();
  const { setAttachments } = useComposerActions();
  const [selectedIds, setSelectedIds] = useState([
    images.find((item) => item.output.fileEntryId !== initialOutput)!.output.fileEntryId,
    initialOutput,
  ]);
  const closeFromBack = useEffectEvent(onClose);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      closeFromBack();
      return true;
    });
    return () => listener.remove();
  }, []);
  const label = (item: PaintingComparisonImage) =>
    t('painting.workspace.candidate', {
      version: item.versionNumber,
      number: item.candidateNumber,
    });
  return (
    <View className="absolute inset-0 z-50 bg-constant-black" accessibilityViewIsModal>
      <StatusBar style="light" />
      <View
        className="flex-row items-center gap-3 px-4 pb-3"
        style={{ paddingTop: Math.max(insets.top, 12) }}
      >
        <HeaderIconButton
          accessibilityLabel={t('common.back')}
          className="bg-constant-white/10"
          onPress={onClose}
        >
          <ArrowLeftIcon className="size-5 text-constant-white" />
        </HeaderIconButton>
        <Text className="font-medium text-constant-white text-base">
          {t('painting.workspace.compare')}
        </Text>
      </View>
      <View
        className="flex-1 flex-row gap-3 px-3 pt-6"
        style={{ paddingBottom: Math.max(insets.bottom, 24) }}
      >
        {(['left', 'right'] as const).map((position) => {
          const side = position === 'left' ? 0 : 1;
          const id = selectedIds[side];
          const image = images.find((item) => item.output.fileEntryId === id)!;
          return (
            <View className="min-h-0 min-w-0 flex-1 gap-3" key={position}>
              <ActionMenu
                items={images.map((item) => ({
                  id: item.output.fileEntryId,
                  label: label(item),
                  checked: item.output.fileEntryId === id,
                  onPress: () =>
                    setSelectedIds((current) =>
                      current.map((value, index) =>
                        index === side ? item.output.fileEntryId : value,
                      ),
                    ),
                }))}
              >
                <View
                  accessibilityRole="button"
                  accessibilityLabel={label(image)}
                  className="flex-row items-center gap-2 self-start rounded-2xl bg-constant-white/10 px-3 py-2"
                >
                  <Text className="min-w-0 shrink text-constant-white text-xs" numberOfLines={1}>
                    {label(image)}
                  </Text>
                  <ChevronDownIcon className="size-3 text-constant-white" />
                </View>
              </ActionMenu>
              <Image
                source={image.output.uri}
                contentFit="contain"
                accessibilityLabel={label(image)}
                style={{ flex: 1, width: '100%' }}
              />
              <Button
                onPress={() => {
                  setAttachments([createPaintingOutputAttachmentDraft(image.output)]);
                  reference.clear();
                  onEdit(image.output);
                }}
                size="sm"
                variant="ghost"
              >
                <Text className="font-medium text-sm text-constant-white">
                  {t('painting.input.useReference')}
                </Text>
              </Button>
            </View>
          );
        })}
      </View>
    </View>
  );
}

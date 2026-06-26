import { BottomSheet, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { TagGroup } from 'heroui-native';
import { Button } from 'heroui-native/button';
import { Input } from 'heroui-native/input';
import { Spinner } from 'heroui-native/spinner';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getProviderAvatarColor } from './providerAvatarUtils';

const SNAP_POINTS = ['65%'];

type EndpointOption = {
  type: string;
  labelKey: string;
};

type CreateCustomProviderSheetProps = {
  canSubmit: boolean;
  endpointOptions: EndpointOption[];
  isOpen: boolean;
  isSubmitting: boolean;
  name: string;
  selectedEndpointType: string;
  onClose: () => void;
  setName: (value: string) => void;
  onSelectEndpointType: (type: string) => void;
  onSubmit: () => void;
};

export function CreateCustomProviderSheet({
  canSubmit,
  endpointOptions,
  isOpen,
  isSubmitting,
  name,
  selectedEndpointType,
  onClose,
  setName,
  onSelectEndpointType,
  onSubmit,
}: CreateCustomProviderSheetProps) {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetHeight =
    (windowHeight - insets.top - insets.bottom) * (parseInt(SNAP_POINTS[0], 10) / 100);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const avatarLetter = name.trim().charAt(0).toUpperCase() || 'P';
  const { bg: avatarBgColor, fg: avatarFgColor } = name.trim()
    ? getProviderAvatarColor(name)
    : { bg: '#999', fg: '#fff' };

  return (
    <BottomSheet
      backgroundStyle={{ backgroundColor: colorScheme === 'dark' ? '#000000' : '#FFFFFF' }}
      enablePanDownToClose={!isSubmitting}
      enableDynamicSizing={false}
      handleComponent={null}
      index={isOpen ? 0 : -1}
      snapPoints={SNAP_POINTS}
      onClose={handleClose}
    >
      <BottomSheetView style={styles.sheetContent}>
        <View style={[styles.sheetViewport, { height: sheetHeight }]}>
          <View className="pl-5 pb-5 pt-5">
            <Text className="font-semibold text-foreground text-lg" numberOfLines={1}>
              {t('settings.provider.create_custom.title')}
            </Text>
          </View>
          <View className="flex-1 px-4">
            {/* Avatar */}
            <View className="items-center pb-5">
              <View
                className="size-20 items-center justify-center overflow-hidden rounded-full"
                style={{ backgroundColor: avatarBgColor }}
              >
                <Text className="text-3xl font-bold" style={{ color: avatarFgColor }}>
                  {avatarLetter}
                </Text>
              </View>
            </View>

            {/* Name input */}
            <View className="gap-2 pb-5">
              <Text className="font-medium text-default-foreground text-sm">
                {t('settings.provider.create_custom.name')}
              </Text>
              <Input
                accessibilityLabel={t('settings.provider.create_custom.name')}
                autoCapitalize="none"
                autoComplete="off"
                autoCorrect={false}
                isDisabled={isSubmitting}
                maxLength={32}
                placeholder={t('settings.provider.create_custom.namePlaceholder')}
                spellCheck={false}
                value={name}
                variant="secondary"
                onChangeText={setName}
              />
            </View>

            {/* Endpoint type selector */}
            <View className="gap-2">
              <Text className="font-medium text-default-foreground text-sm">
                {t('settings.provider.create_custom.endpointType')}
              </Text>
              <TagGroup
                isDisabled={isSubmitting}
                selectedKeys={selectedEndpointType ? new Set([selectedEndpointType]) : new Set()}
                selectionMode="single"
                onSelectionChange={(keys) => {
                  const key = keys.values().next().value;
                  if (key) {
                    onSelectEndpointType(key as string);
                  }
                }}
              >
                <TagGroup.List>
                  {endpointOptions.map((option) => (
                    <TagGroup.Item id={option.type} key={option.type}>
                      <TagGroup.ItemLabel>{t(option.labelKey)}</TagGroup.ItemLabel>
                    </TagGroup.Item>
                  ))}
                </TagGroup.List>
              </TagGroup>
            </View>
          </View>
          {/* Bottom actions */}
          <View className="flex-row items-center gap-3 px-4 pb-4 pt-2">
            <Button
              className="h-9 min-h-0 flex-1 rounded-lg"
              isDisabled={isSubmitting}
              variant="secondary"
              onPress={handleClose}
            >
              <Button.Label>
                <Text numberOfLines={1}>{t('common.cancel')}</Text>
              </Button.Label>
            </Button>
            <Button
              className="h-9 min-h-0 flex-1 rounded-lg"
              isDisabled={!canSubmit}
              variant="primary"
              onPress={onSubmit}
            >
              <Button.Label>
                {isSubmitting ? <Spinner size="sm" /> : null}
                <Text numberOfLines={1}>{t('button.add')}</Text>
              </Button.Label>
            </Button>
          </View>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetContent: {
    flex: 1,
  },
  sheetViewport: {
    flex: 1,
  },
});

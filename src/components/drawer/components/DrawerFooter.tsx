import { Button } from 'heroui-native/button';
import { useThemeColor } from 'heroui-native/hooks';
import { SettingsIcon } from 'lucide-uniwind';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useDrawerActions } from '../context/DrawerProvider';

export const DrawerFooter = memo(function DrawerFooter() {
  const { t } = useTranslation();
  const separatorColor = useThemeColor('separator');
  const { openSettings } = useDrawerActions();

  return (
    <View
      className="py-1"
      style={{ borderTopColor: separatorColor, borderTopWidth: StyleSheet.hairlineWidth }}
    >
      <Button
        accessibilityLabel={t('navigation.settings')}
        className="h-auto justify-start gap-3 rounded-none px-4 py-3"
        onPress={openSettings}
        variant="ghost"
      >
        <SettingsIcon className="size-5 text-foreground" strokeWidth={2} />
        <Button.Label className="font-medium text-base text-foreground">
          {t('navigation.settings')}
        </Button.Label>
      </Button>
    </View>
  );
});

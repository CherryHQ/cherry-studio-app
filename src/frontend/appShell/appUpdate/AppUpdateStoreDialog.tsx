import { Button, Dialog } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { DomesticAppStore } from '@/shared/contracts/appUpdate';

import { DOMESTIC_STORE_KEYS } from './domesticStoreKeys';

/** Manual checks remain useful when the install source or live version cannot be established. */
export function AppUpdateStoreDialog({
  stores,
  onClose,
  onOpenStore,
}: {
  stores: DomesticAppStore[] | null;
  onClose(): void;
  onOpenStore(store: DomesticAppStore): void;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(stores);
  if (stores && stores !== shown) setShown(stores);
  if (!shown) return null;
  return (
    <Dialog
      open={stores !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('appUpdate.checkInStore')}
    >
      <Text className="text-base text-foreground">
        {t(shown.length ? 'appUpdate.storeCheckUnknown' : 'appUpdate.storeUnavailable')}
      </Text>
      <View className="gap-3">
        {shown.map((store) => (
          <Button key={store} onPress={() => onOpenStore(store)}>
            {t(DOMESTIC_STORE_KEYS[store])}
          </Button>
        ))}
        <Button onPress={onClose} variant="ghost">
          {t('appUpdate.later')}
        </Button>
      </View>
    </Dialog>
  );
}

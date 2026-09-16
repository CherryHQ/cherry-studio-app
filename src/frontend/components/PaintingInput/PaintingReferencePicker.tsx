import { Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { FileEntryPreview } from '@/frontend/components/FileEntryPreview';

import type { PaintingReference } from './usePaintingReference';

export function PaintingReferencePicker({ reference }: { reference: PaintingReference }) {
  const { t } = useTranslation();

  if (!reference.isPickerOpen) return null;

  return (
    <View className="gap-2 pb-2">
      <Text className="text-sm text-muted-foreground">{t('painting.input.chooseReference')}</Text>
      <ScrollView horizontal keyboardShouldPersistTaps="handled" contentContainerClassName="gap-2">
        {reference.images.map((image, index) => (
          <View className="items-center gap-1" key={image.fileEntryId}>
            <FileEntryPreview entryId={image.fileEntryId} variant="attachment" />
            <Button
              accessibilityLabel={t('painting.input.useReferenceNumber', { number: index + 1 })}
              onPress={() => reference.select(image)}
              size="sm"
              variant="secondary"
            >
              <Button.Label>{t('painting.input.useReference')}</Button.Label>
            </Button>
          </View>
        ))}
      </ScrollView>
      <Button onPress={reference.clear} size="sm" variant="ghost">
        <Button.Label>{t('painting.input.newImage')}</Button.Label>
      </Button>
    </View>
  );
}

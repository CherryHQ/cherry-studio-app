import { Image } from '@cherrystudio/ui/components';
import { type ComponentProps, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

/** Inline preview; the surrounding artifact link opens the recoverable viewer. */
export function ArtifactImage({
  label,
  onError,
  ...props
}: ComponentProps<typeof Image> & { label: string }) {
  const { t } = useTranslation();
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <View className="flex-1 items-center justify-center gap-2 p-4">
        <Text className="text-base text-foreground">{label}</Text>
        <Text className="text-sm text-muted-foreground">{t('fileViewer.previewFailed')}</Text>
      </View>
    );
  }

  return (
    <Image
      {...props}
      onError={(event) => {
        setHasError(true);
        onError?.(event);
      }}
    />
  );
}

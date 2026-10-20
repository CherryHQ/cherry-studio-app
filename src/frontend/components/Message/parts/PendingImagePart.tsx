import { ImageGenerationLoader } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, View } from 'react-native';

/**
 * Holds a generating image's requested shape at full message width with the
 * shared loader, until the image's own file part takes its place.
 */
export function PendingImagePart({
  aspectRatio,
  testID,
}: {
  aspectRatio: number;
  testID?: string;
}) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(0);
  const handleLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return (
    <View className="w-full" onLayout={handleLayout}>
      {width > 0 ? (
        <ImageGenerationLoader
          accessibilityLabel={t('painting.status.generating')}
          active
          height={width / aspectRatio}
          testID={testID}
          width={width}
        />
      ) : (
        <View style={{ aspectRatio }} />
      )}
    </View>
  );
}

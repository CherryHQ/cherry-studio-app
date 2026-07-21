import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Image } from '@/components/nativePrimitives';

type ViewerOutput = { fileEntryId: string; uri: string };

export function ViewerPager({
  initialIndex,
  onPageChange,
  outputs,
}: {
  initialIndex: number;
  onPageChange: (index: number) => void;
  outputs: readonly ViewerOutput[];
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  return (
    <ScrollView
      contentOffset={{ x: initialIndex * width, y: 0 }}
      horizontal
      onMomentumScrollEnd={({ nativeEvent }) => {
        const index = Math.round(nativeEvent.contentOffset.x / width);
        onPageChange(Math.max(0, Math.min(outputs.length - 1, index)));
      }}
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      testID="painting-viewer-pager"
    >
      {outputs.map((output) => (
        <View className="h-full" key={output.fileEntryId} style={{ width }}>
          <Image
            accessibilityLabel={t('painting.output')}
            cachePolicy="memory-disk"
            contentFit="contain"
            source={output.uri}
            style={styles.image}
            testID={`painting-viewer-output-${output.fileEntryId}`}
            transition={120}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  image: {
    height: '100%',
    width: '100%',
  },
});

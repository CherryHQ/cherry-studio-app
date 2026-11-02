import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, View } from 'react-native';

import type { DocumentExportArtifact } from '@/shared/contracts/documentExport';

/** Native horizontal paging owns swipes; the preview has no competing tap or zoom action. */
export function ShareImageCarousel({
  artifact,
  disabled,
  onError,
}: {
  artifact: Extract<DocumentExportArtifact, { format: 'image' }>;
  disabled: boolean;
  onError(): void;
}) {
  const { t } = useTranslation();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [index, setIndex] = useState(0);
  return (
    <View className="min-h-0 flex-1 gap-2" testID="chat-share-carousel">
      <View
        className="min-h-0 flex-1"
        onLayout={({ nativeEvent: { layout } }) =>
          setSize({ width: layout.width, height: layout.height })
        }
      >
        {size.width > 0 && size.height > 0 ? (
          <FlatList
            data={artifact.pages}
            horizontal
            pagingEnabled
            directionalLockEnabled
            scrollEnabled={!disabled}
            showsHorizontalScrollIndicator={false}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            windowSize={3}
            keyExtractor={(page) => page.file.uri}
            getItemLayout={(_, page) => ({
              length: size.width,
              offset: size.width * page,
              index: page,
            })}
            onMomentumScrollEnd={({ nativeEvent }) =>
              setIndex(Math.round(nativeEvent.contentOffset.x / size.width))
            }
            renderItem={({ item, index: page }) => (
              <Image
                accessible
                accessibilityRole="image"
                accessibilityLabel={t('documentExport.page', {
                  page: page + 1,
                  total: artifact.pages.length,
                })}
                source={{ uri: item.file.uri }}
                contentFit="contain"
                onError={onError}
                style={size}
              />
            )}
          />
        ) : null}
      </View>
      {artifact.pages.length > 1 ? (
        <Text className="text-center text-muted-foreground text-xs">
          {`${index + 1} / ${artifact.pages.length}`}
        </Text>
      ) : null}
    </View>
  );
}

import { ContentState } from '@cherrystudio/ui/components';
import { type ComponentProps, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ArtifactPreviewTarget } from '../ArtifactPreviewTransition/ArtifactPreviewTransition';
import { ZoomableImage } from './ZoomableImage';

export function ArtifactImageViewer({
  accessibilityLabel,
  onLoad,
  onZoomChange,
  uri,
}: {
  accessibilityLabel: string;
  onLoad?: ComponentProps<typeof ZoomableImage>['onLoad'];
  onZoomChange?: (isZoomed: boolean) => void;
  uri: string;
}) {
  const { t } = useTranslation();
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const [{ height, width }, setSize] = useState({ height: 0, width: 0 });

  return (
    <ArtifactPreviewTarget>
      <View
        className="flex-1"
        onLayout={({ nativeEvent: { layout } }) =>
          setSize((current) =>
            current.width === layout.width && current.height === layout.height
              ? current
              : { height: layout.height, width: layout.width },
          )
        }
      >
        {failedUri === uri ? (
          <View className="flex-1 items-center justify-center p-6">
            <View className="w-full rounded-2xl bg-background p-6">
              <ContentState.Error
                description={t('fileViewer.readFailedDescription')}
                primaryAction={{ children: t('common.retry'), onPress: () => setFailedUri(null) }}
                title={t('fileViewer.previewFailed')}
              />
            </View>
          </View>
        ) : height > 0 && width > 0 ? (
          <ZoomableImage
            key={uri}
            accessibilityLabel={accessibilityLabel}
            height={height}
            onError={() => {
              setFailedUri(uri);
              onZoomChange?.(false);
            }}
            onZoomChange={onZoomChange}
            onLoad={onLoad}
            uri={uri}
            width={width}
          />
        ) : null}
      </View>
    </ArtifactPreviewTarget>
  );
}

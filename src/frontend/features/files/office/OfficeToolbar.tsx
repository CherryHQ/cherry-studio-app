import ChevronLeft from '@cherrystudio/app-icons/icons/chevron-left';
import ChevronRight from '@cherrystudio/app-icons/icons/chevron-right';
import Minus from '@cherrystudio/app-icons/icons/minus';
import Plus from '@cherrystudio/app-icons/icons/plus';
import { Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, useWindowDimensions, View } from 'react-native';

import { useLayoutWidth } from '@/frontend/hooks/useLayoutWidth';

import {
  OFFICE_MAX_ZOOM,
  OFFICE_MIN_ZOOM,
  type OfficeCommand,
  type OfficeStatus,
} from './officePreview';

export function OfficeToolbar({
  status,
  onCommand,
}: {
  status: OfficeStatus;
  onCommand: (name: OfficeCommand['name'], value: number) => void;
}) {
  const { t } = useTranslation();
  const { width, onLayout } = useLayoutWidth();
  const { fontScale } = useWindowDimensions();
  const wide = width >= 520 * Math.min(fontScale, 1.6);
  const hasSheets = status.sheets.length > 0;
  return (
    <View className="pb-safe" onLayout={onLayout}>
      {hasSheets ? (
        <View className="border-t border-border">
          <FlatList
            horizontal
            data={status.sheets}
            extraData={status.sheet}
            contentContainerClassName="gap-1 px-3 py-1"
            showsHorizontalScrollIndicator
            keyExtractor={(_, index) => String(index)}
            renderItem={({ item, index }) => (
              <View className="max-w-56">
                <Button
                  accessibilityLabel={item}
                  accessibilityState={{ selected: status.sheet === index }}
                  disabled={status.busy}
                  variant={status.sheet === index ? 'secondary' : 'ghost'}
                  onPress={() => onCommand('sheet', index)}
                >
                  <Button.Label numberOfLines={1}>{item}</Button.Label>
                </Button>
              </View>
            )}
          />
        </View>
      ) : null}
      <View
        className={
          wide
            ? 'flex-row flex-wrap items-center justify-center gap-x-6 px-3 py-1'
            : 'items-center gap-1 px-3 py-1'
        }
      >
        {!hasSheets ? (
          <View className="flex-row items-center gap-2">
            <Button
              accessibilityLabel={t('fileViewer.office.previousPage')}
              disabled={status.busy || status.page <= 1}
              icon={<ChevronLeft />}
              size="lg"
              variant="ghost"
              onPress={() => onCommand('page', status.page - 1)}
            />
            <Text className="text-center text-sm text-foreground" accessibilityLiveRegion="polite">
              {t('fileViewer.pagePosition', { current: status.page, total: status.pages })}
            </Text>
            <Button
              accessibilityLabel={t('fileViewer.office.nextPage')}
              disabled={status.busy || status.page >= status.pages}
              icon={<ChevronRight />}
              size="lg"
              variant="ghost"
              onPress={() => onCommand('page', status.page + 1)}
            />
          </View>
        ) : null}
        <View className="flex-row items-center gap-2">
          <Button
            accessibilityLabel={t('fileViewer.office.zoomOut')}
            disabled={status.busy || status.zoom <= OFFICE_MIN_ZOOM}
            icon={<Minus />}
            size="lg"
            variant="ghost"
            onPress={() => onCommand('zoom', status.zoom - 10)}
          />
          <Button
            accessibilityLabel={t(
              hasSheets ? 'fileViewer.office.resetZoom' : 'fileViewer.office.fitPage',
            )}
            disabled={status.busy}
            variant="ghost"
            onPress={() => onCommand('zoom', 100)}
          >
            <Button.Label>{status.zoom}%</Button.Label>
          </Button>
          <Button
            accessibilityLabel={t('fileViewer.office.zoomIn')}
            disabled={status.busy || status.zoom >= OFFICE_MAX_ZOOM}
            icon={<Plus />}
            size="lg"
            variant="ghost"
            onPress={() => onCommand('zoom', status.zoom + 10)}
          />
        </View>
      </View>
      {status.warning ? (
        <Text className="px-4 pb-2 text-center text-xs text-muted-foreground">
          {t('fileViewer.office.partialContent')}
        </Text>
      ) : null}
    </View>
  );
}

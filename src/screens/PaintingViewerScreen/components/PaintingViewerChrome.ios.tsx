import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { PaintingViewerChromeProps } from './PaintingViewerChrome.types';

// Native iOS 26 liquid-glass toolbars: X on the left, download + more menu on
// the right, edit + resize menu in the bottom toolbar. Rendered from the screen
// (a page component) so placement="bottom" is allowed.
export function PaintingViewerChrome({
  aspectRatios,
  onClose,
  onDelete,
  onDownload,
  onEdit,
  onResizeSelect,
}: PaintingViewerChromeProps) {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={t('painting.viewer.close')}
          icon="xmark"
          onPress={onClose}
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={t('painting.viewer.download')}
          icon="square.and.arrow.down"
          onPress={onDownload}
        />
        <Stack.Toolbar.Menu accessibilityLabel={t('painting.viewer.more')} icon="ellipsis">
          <Stack.Toolbar.MenuAction destructive icon="trash" onPress={onDelete}>
            {t('painting.viewer.delete')}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      <Stack.Toolbar placement="bottom">
        <Stack.Toolbar.Button
          accessibilityLabel={t('painting.viewer.edit')}
          icon="pencil"
          onPress={onEdit}
        />
        <Stack.Toolbar.Menu accessibilityLabel={t('painting.viewer.resize')} icon="aspectratio">
          {aspectRatios.map((ratio) => (
            <Stack.Toolbar.MenuAction key={ratio} onPress={() => onResizeSelect(ratio)}>
              {ratio}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Spacer />
      </Stack.Toolbar>
    </>
  );
}

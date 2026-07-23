import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { SFSymbol } from 'sf-symbols-typescript';

import type { PaintingViewerChromeProps } from './PaintingViewerChrome.types';

// Native aspect-ratio glyph per ratio. iOS ships `rectangle.ratio.W.to.H`
// symbols, so the menu shows a shape that matches each option (1:1 falls back to
// `square`). Android drops SF Symbols, so its menu stays text-only by design.
const ASPECT_RATIO_ICONS: Record<string, SFSymbol> = {
  '1:1': 'square',
  '3:4': 'rectangle.ratio.3.to.4',
  '4:3': 'rectangle.ratio.4.to.3',
  '9:16': 'rectangle.ratio.9.to.16',
  '16:9': 'rectangle.ratio.16.to.9',
};

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
  onViewConversation,
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
          <Stack.Toolbar.MenuAction icon="message" onPress={onViewConversation}>
            {t('painting.viewer.viewConversation')}
          </Stack.Toolbar.MenuAction>
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
            <Stack.Toolbar.MenuAction
              icon={ASPECT_RATIO_ICONS[ratio]}
              key={ratio}
              onPress={() => onResizeSelect(ratio)}
            >
              {ratio}
            </Stack.Toolbar.MenuAction>
          ))}
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Spacer />
      </Stack.Toolbar>
    </>
  );
}

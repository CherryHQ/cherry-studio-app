import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { getNavTitleKey, isMoreModuleId } from './dockTabs';
import { NavCardBadge } from './NavCardBadge';
import { NavIcon } from './NavIcon';
import { useNavigationShell } from './state';

/** Floating ghost badge rendered while dragging a 「更多」 card or middle dock tab. */
export function FloatingDragOverlay() {
  const { t } = useTranslation();
  const { dragState } = useNavigationShell();
  const foregroundColor = useThemeColor('foreground');

  if (!dragState) {
    return null;
  }

  const label = t(getNavTitleKey(dragState.id));
  const statusLabel = dragState.draggingOut
    ? t('navigation.dropToUnpin')
    : dragState.overDock && dragState.source === 'more'
      ? t('navigation.dropToPin')
      : undefined;

  return (
    <View className="absolute inset-0 z-50" pointerEvents="none" testID="floating-drag-overlay">
      <View
        className="bg-card border-border-strong flex-row items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 shadow-xl"
        style={{
          left: Math.max(12, dragState.x - 64),
          position: 'absolute',
          top: Math.max(48, dragState.y - 36),
        }}
      >
        {isMoreModuleId(dragState.id) ? (
          <NavCardBadge id={dragState.id} size={18} />
        ) : (
          <View className="bg-secondary-active h-9 w-9 items-center justify-center rounded-xl">
            <NavIcon color={foregroundColor} filled id={dragState.id} size={20} />
          </View>
        )}
        <View>
          <Text className="text-foreground text-sm font-medium">{label}</Text>
          {statusLabel ? (
            <Text className="text-muted-foreground text-xs">{statusLabel}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

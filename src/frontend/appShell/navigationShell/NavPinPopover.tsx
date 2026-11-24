import ChevronLeftIcon from '@cherrystudio/app-icons/icons/chevron-left';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import PinIcon from '@cherrystudio/app-icons/icons/pin';
import PinOffIcon from '@cherrystudio/app-icons/icons/pin-off';
import { Surface } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

import { canPinTab, canUnpinTab } from './dockTabs';
import {
  useNavigationShell,
  useNavigationShellActions,
  useNavigationShellInteraction,
} from './state';

const POPOVER_MARGIN = 12;
const POPOVER_ESTIMATED_WIDTH = 220;

/** Floating capsule action bar shown after a 350ms long-press on 「更多」 cards or dock middle tabs. */
export function NavPinPopover() {
  const { t } = useTranslation();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { pinnedTabs } = useNavigationShell();
  const { closePinPopover, pinTabToDock, reorderMiddleTab, unpinTabFromDock } =
    useNavigationShellActions();
  const { popover } = useNavigationShellInteraction();
  const [foregroundColor, mutedForegroundColor] = useThemeColor(['foreground', 'muted-foreground']);

  if (!popover) {
    return null;
  }

  const left = Math.max(
    POPOVER_MARGIN,
    Math.min(windowWidth - POPOVER_ESTIMATED_WIDTH - POPOVER_MARGIN, popover.x - 90),
  );
  const top = Math.max(72, Math.min(windowHeight - 130, popover.y - 68));

  const currentIndex = pinnedTabs.indexOf(popover.id);
  const canMoveLeft = popover.source === 'dock' && currentIndex > 0;
  const canMoveRight =
    popover.source === 'dock' && currentIndex >= 0 && currentIndex < pinnedTabs.length - 1;
  const canUnpin = popover.source === 'dock' && canUnpinTab(pinnedTabs, popover.id);
  const canPin = popover.source === 'more' && canPinTab(pinnedTabs, popover.id);

  return (
    <>
      <Pressable
        accessibilityLabel={t('common.close')}
        className="absolute inset-0 z-40"
        onPress={closePinPopover}
        testID="nav-pin-popover-backdrop"
      />
      <View className="absolute z-50" style={{ left, top }}>
        <Surface interactive shape="pill">
          <View className="flex-row items-center gap-1 p-1.5" testID="nav-pin-popover">
            {popover.source === 'more' ? (
              <Pressable
                accessibilityRole="button"
                className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 ${
                  canPin ? 'active:opacity-70' : 'opacity-60'
                }`}
                onPress={() => {
                  pinTabToDock(popover.id);
                  closePinPopover();
                }}
                testID={`nav-popover-pin-${popover.id}`}
              >
                <PinIcon color={canPin ? foregroundColor : mutedForegroundColor} size={15} />
                <Text
                  className={`text-xs font-medium ${canPin ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  {t('navigation.pinToDock')}
                </Text>
              </Pressable>
            ) : (
              <>
                {canMoveLeft ? (
                  <Pressable
                    accessibilityRole="button"
                    className="flex-row items-center gap-1 rounded-full px-2.5 py-2"
                    onPress={() => {
                      reorderMiddleTab(popover.id, currentIndex - 1);
                      closePinPopover();
                    }}
                    testID={`nav-popover-move-left-${popover.id}`}
                  >
                    <ChevronLeftIcon color={foregroundColor} size={14} />
                    <Text className="text-foreground text-xs font-medium">
                      {t('navigation.moveLeft')}
                    </Text>
                  </Pressable>
                ) : null}
                {canMoveRight ? (
                  <Pressable
                    accessibilityRole="button"
                    className="flex-row items-center gap-1 rounded-full px-2.5 py-2"
                    onPress={() => {
                      reorderMiddleTab(popover.id, currentIndex + 1);
                      closePinPopover();
                    }}
                    testID={`nav-popover-move-right-${popover.id}`}
                  >
                    <Text className="text-foreground text-xs font-medium">
                      {t('navigation.moveRight')}
                    </Text>
                    <ChevronRightIcon color={foregroundColor} size={14} />
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 ${
                    canUnpin ? '' : 'opacity-60'
                  }`}
                  onPress={() => {
                    unpinTabFromDock(popover.id);
                    closePinPopover();
                  }}
                  testID={`nav-popover-unpin-${popover.id}`}
                >
                  <PinOffIcon color={canUnpin ? foregroundColor : mutedForegroundColor} size={15} />
                  <Text
                    className={`text-xs font-medium ${
                      canUnpin ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {t('navigation.unpinFromDock')}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </Surface>
      </View>
    </>
  );
}

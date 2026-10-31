import type { MenuIcon, MenuItem } from '@cherrystudio/ui/components';
import { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

import { HeaderAction } from './HeaderAction';
import type { HeaderActionTone, HeaderToolbarAction } from './HeaderAction.types';

const MENU_ICONS = { branch: 'arrow.triangle.branch' } satisfies Record<
  MenuIcon,
  ComponentProps<typeof Stack.Toolbar.MenuAction>['icon']
>;

/**
 * One action as a direct child of an iOS `Stack.Toolbar`. With the native toolbar's shared glass
 * surface (iOS 26 and later), an icon or menu action with a `nativeIcon` becomes a standard toolbar
 * item, which the system places where the window keeps its controls, such as an iPhone Duo's
 * vertical rail. Every other action keeps its custom view and, before iOS 26, the fallback surface.
 * A plain function, not a component: Expo reads the toolbar's direct children before rendering them.
 */
export function renderHeaderToolbarItem(
  action: HeaderToolbarAction,
  { surfaceClassName, tone }: { surfaceClassName?: string; tone?: HeaderActionTone } = {},
) {
  if (isLiquidGlassAvailable && action.type === 'icon' && action.nativeIcon) {
    return (
      <Stack.Toolbar.Button
        key={action.key}
        accessibilityLabel={action.accessibilityLabel}
        disabled={action.disabled}
        icon={action.nativeIcon}
        iconRenderingMode="template"
        onPress={action.onPress}
      />
    );
  }

  if (isLiquidGlassAvailable && action.type === 'menu' && action.nativeIcon) {
    return (
      <Stack.Toolbar.Menu
        key={action.key}
        accessibilityLabel={action.accessibilityLabel}
        disabled={action.disabled}
        icon={action.nativeIcon}
        iconRenderingMode="template"
      >
        {renderMenuSections(action.items)}
      </Stack.Toolbar.Menu>
    );
  }

  return (
    <Stack.Toolbar.View key={action.key}>
      <View className={surfaceClassName}>
        <HeaderAction action={action} tone={tone} />
      </View>
    </Stack.Toolbar.View>
  );
}

/** Contiguous items with the same group share a section, as in the custom menu. */
function renderMenuSections(items: readonly MenuItem[]) {
  const sections: MenuItem[][] = [];
  items.forEach((item, index) => {
    if (index === 0 || item.group !== items[index - 1]?.group) sections.push([]);
    sections.at(-1)?.push(item);
  });
  if (sections.length === 1) return sections[0]?.map(renderMenuAction);
  return sections.map((section) => (
    <Stack.Toolbar.Menu key={section[0]?.id} inline>
      {section.map(renderMenuAction)}
    </Stack.Toolbar.Menu>
  ));
}

function renderMenuAction(item: MenuItem) {
  return (
    <Stack.Toolbar.MenuAction
      key={item.id}
      destructive={item.destructive}
      disabled={item.disabled}
      icon={item.icon ? MENU_ICONS[item.icon] : undefined}
      isOn={item.checked}
      onPress={item.onPress}
    >
      {item.label}
    </Stack.Toolbar.MenuAction>
  );
}

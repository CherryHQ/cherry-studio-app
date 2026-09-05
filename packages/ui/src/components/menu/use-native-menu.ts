import { useCallback, useMemo } from 'react';
import { getHostComponent } from 'react-native-nitro-modules';

import type { MenuIcon, MenuItem } from './menu.types';
import type {
  CherryMenuView,
  CherryMenuViewMethods,
  CherryMenuViewProps,
  NativeMenuCheckedState,
  NativeMenuIcon,
  NativeMenuItem,
} from './specs/cherry-menu-view.nitro';

const getViewConfig = () =>
  require('../../../nitrogen/generated/shared/json/CherryMenuViewConfig.json');

export const NativeCherryMenuView = getHostComponent<CherryMenuViewProps, CherryMenuViewMethods>(
  'CherryMenuView',
  getViewConfig,
);

export type NativeCherryMenuRef = CherryMenuView;

function getCheckedState(checked: boolean | undefined): NativeMenuCheckedState {
  if (checked === undefined) {
    return 'none';
  }

  return checked ? 'on' : 'off';
}

function getIcon(icon: MenuIcon | undefined): NativeMenuIcon {
  return icon ?? 'none';
}

/** Projects public menu items onto native view props and routes action ids back. */
export function useNativeMenu(items: readonly MenuItem[]) {
  const actions = useMemo(() => new Map(items.map((item) => [item.id, item.onPress])), [items]);
  const nativeItems = useMemo<NativeMenuItem[]>(
    () =>
      items.map((item) => ({
        checked: getCheckedState(item.checked),
        destructive: item.destructive ?? false,
        disabled: item.disabled ?? false,
        icon: getIcon(item.icon),
        id: item.id,
        label: item.label,
      })),
    [items],
  );
  const onAction = useCallback(
    (id: string) => {
      actions.get(id)?.();
    },
    [actions],
  );

  return { nativeItems, onAction };
}

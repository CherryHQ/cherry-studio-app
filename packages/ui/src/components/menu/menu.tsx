import { useCallback, useMemo } from 'react';
import { callback, getHostComponent } from 'react-native-nitro-modules';

import type { MenuProps } from './menu.types';
import type {
  CherryMenuViewMethods,
  CherryMenuViewProps,
  NativeMenuCheckedState,
} from './specs/cherry-menu-view.nitro';

const getViewConfig = () =>
  require('../../../nitrogen/generated/shared/json/CherryMenuViewConfig.json');

const NativeCherryMenuView = getHostComponent<CherryMenuViewProps, CherryMenuViewMethods>(
  'CherryMenuView',
  getViewConfig,
);

function getCheckedState(checked: boolean | undefined): NativeMenuCheckedState {
  if (checked === undefined) {
    return 'none';
  }

  return checked ? 'on' : 'off';
}

export function Menu({ children, items, trigger }: MenuProps) {
  const actions = useMemo(() => new Map(items.map((item) => [item.id, item.onPress])), [items]);
  const nativeItems = useMemo(
    () =>
      items.map((item) => ({
        checked: getCheckedState(item.checked),
        destructive: item.destructive ?? false,
        disabled: item.disabled ?? false,
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

  if (items.length === 0) {
    return children;
  }

  return (
    <NativeCherryMenuView items={nativeItems} onAction={callback(onAction)} trigger={trigger}>
      {children}
    </NativeCherryMenuView>
  );
}

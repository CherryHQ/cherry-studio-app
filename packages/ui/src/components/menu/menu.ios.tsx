import { MenuView, type MenuAction } from '@expo/ui/community/menu';

import type { MenuProps } from './menu.types';

export function Menu({ children, items, shouldOpenOnLongPress, style, testID }: MenuProps) {
  const actions: MenuAction[] = items.map((item) => ({
    attributes: {
      destructive: item.role === 'destructive',
      disabled: item.disabled,
    },
    id: item.id,
    image: item.systemImage,
    state: item.isOn ? 'on' : undefined,
    title: item.label,
  }));

  return (
    <MenuView
      actions={actions}
      shouldOpenOnLongPress={shouldOpenOnLongPress}
      onPressAction={(event) => {
        items.find((item) => item.id === event.nativeEvent.event)?.onPress();
      }}
      style={style}
      testID={testID}
    >
      {children}
    </MenuView>
  );
}

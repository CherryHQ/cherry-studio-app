import { type MenuAction, MenuView } from '@expo/ui/community/menu';
import { Menu as HeroMenu } from 'heroui-native/menu';

import type { MenuProps } from './menu.types';

export function Menu({ children, items, shouldOpenOnLongPress, style, testID }: MenuProps) {
  if (shouldOpenOnLongPress) {
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
        shouldOpenOnLongPress
        style={style}
        testID={testID}
        onPressAction={(event) => {
          items.find((item) => item.id === event.nativeEvent.event)?.onPress();
        }}
      >
        {children}
      </MenuView>
    );
  }

  return (
    <HeroMenu presentation="popover" style={style} testID={testID}>
      <HeroMenu.Trigger asChild>{children}</HeroMenu.Trigger>
      <HeroMenu.Portal>
        <HeroMenu.Overlay />
        <HeroMenu.Content align="end" placement="bottom" presentation="popover" width={210}>
          {items.map((item) => (
            <HeroMenu.Item
              className="flex-row items-center gap-3"
              id={item.id}
              isDisabled={item.disabled}
              key={item.id}
              onPress={item.onPress}
              testID={item.testID}
              variant={item.role === 'destructive' ? 'danger' : 'default'}
            >
              {item.icon}
              <HeroMenu.ItemTitle>{item.label}</HeroMenu.ItemTitle>
            </HeroMenu.Item>
          ))}
        </HeroMenu.Content>
      </HeroMenu.Portal>
    </HeroMenu>
  );
}

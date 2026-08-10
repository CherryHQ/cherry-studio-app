import { Menu as HeroMenu } from 'heroui-native/menu';

import type { MenuProps } from './menu.types';

export function Menu({ children, items, style, testID }: MenuProps) {
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

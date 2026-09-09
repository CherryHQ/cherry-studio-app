import CheckIcon from '@cherrystudio/app-icons/icons/check';
import GitForkIcon from '@cherrystudio/app-icons/icons/git-fork';
import { Popover, usePopover } from 'heroui-native/popover';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cn } from '../../utils';
import type { MenuItem } from './menu.types';

/** Shared product surface for tap and long-press menus, sized for fingers and scalable text. */
export function MenuContent({ items }: { items: readonly MenuItem[] }) {
  const { isOpen } = usePopover();
  return isOpen ? <OpenMenuContent items={items} /> : null;
}

function OpenMenuContent({ items }: { items: readonly MenuItem[] }) {
  const { onOpenChange } = usePopover();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const maxHeight = Math.max(0, Math.min(480, height - insets.top - insets.bottom - 42));
  const menuWidth = Math.max(0, Math.min(288, width - insets.left - insets.right - 32));

  return (
    <Popover.Portal unstable_accessibilityContainerViewIsModal>
      <Popover.Overlay />
      <Popover.Content
        accessibilityViewIsModal
        align="end"
        className="rounded-lg border border-border bg-popover p-1 shadow-sm"
        insets={{
          bottom: insets.bottom + 16,
          left: insets.left + 16,
          right: insets.right + 16,
          top: insets.top + 16,
        }}
        offset={8}
        presentation="popover"
        role="menu"
        width={menuWidth}
      >
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight }}>
          {items.map((item) => (
            <Pressable
              accessibilityLabel={item.label}
              accessibilityRole={item.checked === undefined ? 'menuitem' : 'checkbox'}
              accessibilityState={{ checked: item.checked, disabled: Boolean(item.disabled) }}
              className={cn(
                'min-h-12 flex-row items-center gap-3 rounded-md px-3 py-3 active:bg-secondary disabled:opacity-40',
                item.checked && 'bg-secondary',
              )}
              disabled={item.disabled}
              key={item.id}
              onPress={() => {
                if (!item.disabled) {
                  onOpenChange(false);
                  item.onPress();
                }
              }}
            >
              {item.icon === 'branch' ? (
                <GitForkIcon
                  className={cn(
                    'size-5',
                    item.destructive ? 'text-destructive' : 'text-muted-foreground',
                  )}
                />
              ) : null}
              <Text
                className={cn(
                  'min-w-0 flex-1 text-base',
                  item.destructive ? 'text-destructive' : 'text-popover-foreground',
                )}
              >
                {item.label}
              </Text>
              {item.checked !== undefined ? (
                <View accessible={false} className="size-5">
                  {item.checked ? <CheckIcon className="size-5 text-popover-foreground" /> : null}
                </View>
              ) : null}
            </Pressable>
          ))}
        </ScrollView>
      </Popover.Content>
    </Popover.Portal>
  );
}

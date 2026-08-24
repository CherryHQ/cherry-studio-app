import XIcon from '@cherrystudio/app-icons/icons/x';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '../../utils';

type ChipChildren = {
  children: ReactNode;
};

export type ChipLabelProps = ComponentPropsWithRef<typeof Text> & {
  className?: string;
};

export type ChipTagProps = Omit<ComponentPropsWithRef<typeof View>, 'children'> &
  ChipChildren & {
    className?: string;
  };

export type ChipSelectableProps = Omit<
  ComponentPropsWithRef<typeof Pressable>,
  'children' | 'disabled' | 'onPress'
> &
  ChipChildren & {
    className?: string;
    disabled?: boolean;
    onSelectedChange: (selected: boolean) => void;
    selected: boolean;
  };

export type ChipRemovableProps = Omit<ComponentPropsWithRef<typeof View>, 'children'> &
  ChipChildren & {
    className?: string;
    disabled?: boolean;
    onRemove: () => void;
    removeAccessibilityLabel: string;
  };

const chipBaseClassName =
  'min-w-0 flex-row self-start items-center overflow-hidden rounded-full border border-border bg-secondary px-3 py-1.5';
const chipSelectedClassName = 'border-border-selected bg-secondary-active';

function ChipLabel({ className, ref, ...props }: ChipLabelProps) {
  return (
    <Text
      {...props}
      className={cn('min-w-0 shrink text-sm font-medium text-foreground', className)}
      ref={ref}
    />
  );
}

ChipLabel.displayName = 'Chip.Label';

function ChipContent({ children }: ChipChildren) {
  return typeof children === 'string' || typeof children === 'number' ? (
    <ChipLabel>{children}</ChipLabel>
  ) : (
    children
  );
}

function ChipTag({ children, className, ref, ...props }: ChipTagProps) {
  return (
    <View {...props} className={cn(chipBaseClassName, className)} ref={ref}>
      <ChipContent>{children}</ChipContent>
    </View>
  );
}

ChipTag.displayName = 'Chip.Tag';

function ChipSelectable({
  accessibilityRole = 'checkbox',
  accessibilityState,
  children,
  className,
  disabled = false,
  onSelectedChange,
  ref,
  selected,
  ...props
}: ChipSelectableProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...accessibilityState, checked: selected, disabled }}
      className={cn(
        chipBaseClassName,
        'active:bg-secondary-active disabled:opacity-disabled',
        selected && chipSelectedClassName,
        className,
      )}
      disabled={disabled}
      onPress={() => onSelectedChange(!selected)}
      ref={ref}
    >
      <ChipContent>{children}</ChipContent>
    </Pressable>
  );
}

ChipSelectable.displayName = 'Chip.Selectable';

function ChipRemovable({
  children,
  className,
  disabled = false,
  onRemove,
  ref,
  removeAccessibilityLabel,
  ...props
}: ChipRemovableProps) {
  return (
    <View
      {...props}
      className={cn(
        chipBaseClassName,
        chipSelectedClassName,
        'gap-1.5 pr-1.5',
        disabled && 'opacity-disabled',
        className,
      )}
      ref={ref}
    >
      <ChipContent>{children}</ChipContent>
      <Pressable
        accessibilityLabel={removeAccessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className="shrink-0 items-center justify-center rounded-full p-1 active:bg-secondary-active"
        disabled={disabled}
        hitSlop={6}
        onPress={onRemove}
      >
        <XIcon className="size-3.5 text-muted-foreground" />
      </Pressable>
    </View>
  );
}

ChipRemovable.displayName = 'Chip.Removable';

export const Chip = {
  Label: ChipLabel,
  Removable: ChipRemovable,
  Selectable: ChipSelectable,
  Tag: ChipTag,
};

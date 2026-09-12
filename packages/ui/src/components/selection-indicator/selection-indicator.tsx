import CheckIcon from '@cherrystudio/app-icons/icons/check';
import type { ComponentPropsWithRef } from 'react';
import { View } from 'react-native';

import { cn } from '../../utils';

export type SelectionIndicatorVariant = 'default' | 'overlay';

export type SelectionIndicatorProps = Omit<
  ComponentPropsWithRef<typeof View>,
  'accessibilityElementsHidden' | 'children' | 'importantForAccessibility'
> & {
  className?: string;
  disabled?: boolean;
  selected: boolean;
  variant?: SelectionIndicatorVariant;
};

/** Visual feedback for a parent checkbox or radio row; it is never a second control. */
export function SelectionIndicator({
  className,
  disabled = false,
  ref,
  selected,
  variant = 'default',
  ...props
}: SelectionIndicatorProps) {
  return (
    <View
      {...props}
      accessibilityElementsHidden
      className={cn(
        'size-6 shrink-0 items-center justify-center rounded-full',
        selected ? 'bg-foreground' : 'border-2 border-border-strong',
        !selected && variant === 'overlay' && 'bg-constant-black/30',
        disabled && 'opacity-40',
        className,
      )}
      importantForAccessibility="no"
      ref={ref}
    >
      {selected ? <CheckIcon className="size-4 text-background" /> : null}
    </View>
  );
}

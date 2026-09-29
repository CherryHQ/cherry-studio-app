import CheckIcon from '@cherrystudio/app-icons/icons/check';
import type { ComponentPropsWithRef } from 'react';
import { View } from 'react-native';

import { cn } from '../../utils';

export type SelectionIndicatorVariant = 'default' | 'overlay';
/** Omitted for a list selection mark; a form picks the shape that tells single from multiple. */
export type SelectionIndicatorControl = 'checkbox' | 'radio';

export type SelectionIndicatorProps = Omit<
  ComponentPropsWithRef<typeof View>,
  'accessibilityElementsHidden' | 'children' | 'importantForAccessibility'
> & {
  className?: string;
  control?: SelectionIndicatorControl;
  disabled?: boolean;
  selected: boolean;
  variant?: SelectionIndicatorVariant;
};

/** Visual feedback for a parent checkbox or radio row; it is never a second control. */
export function SelectionIndicator({
  className,
  control,
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
        'size-6 shrink-0 items-center justify-center',
        control === 'checkbox' ? 'rounded-md' : 'rounded-full',
        selected ? 'bg-foreground' : 'border-2 border-border-strong',
        !selected && variant === 'overlay' && 'bg-constant-black/30',
        disabled && 'opacity-40',
        className,
      )}
      importantForAccessibility="no"
      ref={ref}
    >
      {!selected ? null : control === 'radio' ? (
        <View className="size-2.5 rounded-full bg-background" />
      ) : (
        <CheckIcon className="size-4 text-background" />
      )}
    </View>
  );
}

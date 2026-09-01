import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '../../utils';

export type SelectFieldProps = Omit<
  ComponentPropsWithRef<typeof Pressable>,
  'accessibilityLabel' | 'children' | 'disabled' | 'onPress'
> & {
  accessibilityLabel: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onPress: () => void;
};

export type SelectFieldLabelProps = ComponentPropsWithRef<typeof Text> & {
  className?: string;
};

export type SelectFieldValueProps = ComponentPropsWithRef<typeof View> & {
  children: ReactNode;
  className?: string;
};

export type SelectFieldValueTextProps = ComponentPropsWithRef<typeof Text> & {
  className?: string;
};

function SelectFieldLabel({ className, numberOfLines = 1, ref, ...props }: SelectFieldLabelProps) {
  return (
    <Text
      {...props}
      className={cn('min-w-0 shrink text-base text-foreground', className)}
      numberOfLines={numberOfLines}
      ref={ref}
    />
  );
}

SelectFieldLabel.displayName = 'SelectField.Label';

function SelectFieldValue({ children, className, ref, ...props }: SelectFieldValueProps) {
  return (
    <View
      {...props}
      className={cn('min-w-0 flex-1 flex-row items-center justify-end gap-1', className)}
      ref={ref}
    >
      {children}
      <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground" />
    </View>
  );
}

SelectFieldValue.displayName = 'SelectField.Value';

function SelectFieldValueText({
  className,
  numberOfLines = 1,
  ref,
  ...props
}: SelectFieldValueTextProps) {
  return (
    <Text
      {...props}
      className={cn('min-w-0 shrink text-right text-base text-foreground', className)}
      numberOfLines={numberOfLines}
      ref={ref}
    />
  );
}

SelectFieldValueText.displayName = 'SelectField.ValueText';

function SelectFieldRoot({
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  children,
  className,
  disabled = false,
  onPress,
  ref,
  ...props
}: SelectFieldProps) {
  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ ...accessibilityState, disabled }}
      className={cn(
        'min-h-10 flex-row items-center gap-2 rounded-lg border border-border bg-field px-3 py-2 active:opacity-60 disabled:opacity-40',
        className,
      )}
      disabled={disabled}
      onPress={onPress}
      ref={ref}
    >
      {children}
    </Pressable>
  );
}

SelectFieldRoot.displayName = 'SelectField';

export const SelectField = Object.assign(SelectFieldRoot, {
  Label: SelectFieldLabel,
  Value: SelectFieldValue,
  ValueText: SelectFieldValueText,
});

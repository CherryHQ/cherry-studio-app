import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { cn } from '@cherrystudio/ui/utils';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useThemeColor } from '@/frontend/hooks/useThemeColor';

/** These controls belong to the first-use flow, including its spacing, copy and actions. */
export function OnboardingButton({
  children,
  disabled,
  loading,
  onPress,
  testID,
  variant = 'primary',
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  testID?: string;
  variant?: 'primary' | 'secondary' | 'text';
}) {
  const foreground = useThemeColor(variant === 'primary' ? 'background' : 'foreground');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: Boolean(loading), disabled: Boolean(disabled || loading) }}
      className={cn(
        'min-h-14 flex-row items-center justify-center gap-3 rounded-xl px-5 py-4 active:opacity-70',
        variant === 'primary' && 'bg-foreground',
        variant === 'secondary' && 'border border-border',
        variant === 'text' && 'min-h-12 px-0 py-3',
        (disabled || loading) && 'opacity-40',
      )}
      disabled={disabled || loading}
      onPress={onPress}
      testID={testID}
    >
      <View className="absolute left-5" pointerEvents="none">
        <ActivityIndicator animating={Boolean(loading)} color={foreground} hidesWhenStopped />
      </View>
      <Text
        className={cn('px-6 text-center font-medium', variant === 'text' ? 'text-sm' : 'text-base')}
        style={{ color: foreground }}
      >
        {children}
      </Text>
    </Pressable>
  );
}

export function OnboardingChoice({
  checked,
  description,
  disabled,
  onPress,
  title,
  testID,
}: {
  checked: boolean;
  description?: string;
  disabled?: boolean;
  onPress: () => void;
  title: string;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      className="min-h-24 flex-row items-center gap-6 border-b border-border-subtle py-5 active:opacity-70"
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      <View className="min-w-0 flex-1 gap-2">
        <Text className="font-medium text-base text-foreground">{title}</Text>
        {description ? <Text className="text-sm text-muted-foreground">{description}</Text> : null}
      </View>
      <View
        className={cn(
          'size-6 items-center justify-center rounded-sm border',
          checked ? 'border-foreground bg-foreground' : 'border-border-strong',
        )}
      >
        {checked ? <CheckIcon className="size-4 text-background" /> : null}
      </View>
    </Pressable>
  );
}

export function OnboardingOption({
  children,
  description,
  disabled,
  onPress,
  title,
  testID,
}: {
  children?: ReactNode;
  description?: string;
  disabled?: boolean;
  onPress: () => void;
  title: string;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={cn(
        'min-h-20 flex-row items-center gap-4 rounded-2xl border border-border px-5 py-5 active:opacity-70',
        disabled && 'opacity-40',
      )}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      {children}
      <View className="min-w-0 flex-1 gap-2">
        <Text className="font-medium text-base text-foreground">{title}</Text>
        {description ? <Text className="text-sm text-muted-foreground">{description}</Text> : null}
      </View>
      <ChevronRightIcon className="size-5 text-muted-foreground" />
    </Pressable>
  );
}

export function OnboardingLink({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      className="min-h-12 flex-row items-center justify-between gap-4 py-3 active:opacity-70"
      onPress={onPress}
    >
      <Text className="flex-1 text-sm text-foreground">{children}</Text>
      <ChevronRightIcon className="size-4 text-muted-foreground" />
    </Pressable>
  );
}

export function OnboardingField({ label, ...props }: TextInputProps & { label: string }) {
  const placeholderColor = useThemeColor('muted-foreground');
  return (
    <View className="gap-3">
      <Text className="font-medium text-sm text-foreground">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        className="min-h-14 rounded-2xl border border-border bg-card px-4 py-4 text-base text-foreground"
        placeholderTextColor={placeholderColor}
        {...props}
      />
    </View>
  );
}

export function OnboardingMessage({
  children,
  loading,
}: {
  children: ReactNode;
  loading?: boolean;
}) {
  const foreground = useThemeColor('foreground');
  return (
    <View accessibilityLiveRegion="polite" className="items-start gap-4 py-6">
      {loading ? <ActivityIndicator color={foreground} /> : null}
      <Text className="text-base text-muted-foreground">{children}</Text>
    </View>
  );
}

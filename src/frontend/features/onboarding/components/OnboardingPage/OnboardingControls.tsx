import {
  Button,
  ContentState,
  Input,
  Section,
  SelectionIndicator,
  TextField,
} from '@cherrystudio/ui/components';
import type { ReactNode } from 'react';
import { View, type TextInputProps } from 'react-native';

/** Page-specific language and composition over shared product controls. */
export function OnboardingButton({
  variant = 'primary',
  ...props
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  testID?: string;
  variant?: 'primary' | 'secondary' | 'text';
}) {
  return (
    <Button
      {...props}
      size="lg"
      variant={variant === 'primary' ? 'default' : variant === 'secondary' ? 'outline' : 'ghost'}
    />
  );
}

export function OnboardingChoice({
  checked,
  title,
  ...props
}: {
  checked: boolean;
  description?: string;
  disabled?: boolean;
  onPress: () => void;
  title: string;
  testID?: string;
}) {
  return (
    <Section.Item
      {...props}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      label={title}
      density="comfortable"
      inset="none"
      showChevron={false}
      trailing={
        <SelectionIndicator control="checkbox" disabled={props.disabled} selected={checked} />
      }
    />
  );
}

export function OnboardingOption({
  children,
  title,
  ...props
}: {
  children?: ReactNode;
  description?: string;
  disabled?: boolean;
  onPress: () => void;
  title: string;
  testID?: string;
}) {
  return (
    <Section.Item
      {...props}
      density="comfortable"
      inset="none"
      label={title}
      leading={children}
      showChevron
    />
  );
}

export function OnboardingLink({ children, onPress }: { children: string; onPress: () => void }) {
  return (
    <Button accessibilityRole="link" onPress={onPress} variant="link">
      {children}
    </Button>
  );
}

export function OnboardingField({
  label,
  editable,
  ...props
}: Omit<TextInputProps, 'secureTextEntry' | 'value'> & { label: string; value: string }) {
  return (
    <TextField disabled={editable === false}>
      <TextField.Label>{label}</TextField.Label>
      <Input {...props} accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} />
    </TextField>
  );
}

export function OnboardingMessage({ children, loading }: { children: string; loading?: boolean }) {
  return (
    <View className="py-6">
      {loading ? (
        <ContentState.Loading layout="leading" title={children} />
      ) : (
        <ContentState.Empty layout="leading" title={children} />
      )}
    </View>
  );
}

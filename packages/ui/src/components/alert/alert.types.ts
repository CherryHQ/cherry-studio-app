export type DialogActionRole = 'cancel' | 'default' | 'destructive';

export type DialogAction = {
  label: string;
  onPress?: () => void;
  role?: DialogActionRole;
};

export type AlertInput = {
  accessibilityLabel: string;
  autoFocus?: boolean;
  maxLength?: number;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
};

export type AlertProps = {
  actions: readonly DialogAction[];
  description?: string;
  input?: AlertInput;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  testID?: string;
  title: string;
};

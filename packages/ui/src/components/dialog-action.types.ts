export type DialogActionRole = 'cancel' | 'default' | 'destructive';

export type DialogAction = {
  label: string;
  onPress?: () => void;
  role?: DialogActionRole;
};

export type DialogPresentationProps = {
  actions: readonly DialogAction[];
  description?: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  testID?: string;
  title: string;
};

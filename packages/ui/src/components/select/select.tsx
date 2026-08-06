import { Select as HeroSelect } from 'heroui-native/select';
import type {
  SelectItemLabelProps,
  SelectRootProps,
  SelectTriggerProps,
  SelectTriggerRef,
  SelectValueProps,
} from 'heroui-native/select';
import { forwardRef, type Ref } from 'react';
import type { Text, View } from 'react-native';

import { cn } from '../../utils';

type SelectionMode = 'multiple' | 'single';
type SelectRootPropsWithRef<M extends SelectionMode> = SelectRootProps<M> & {
  ref?: Ref<View>;
};

function SelectRoot<M extends SelectionMode = 'single'>(props: SelectRootPropsWithRef<M>) {
  return <HeroSelect {...props} />;
}

const SelectTrigger = forwardRef<SelectTriggerRef, SelectTriggerProps>(function SelectTrigger(
  { className, variant = 'default', ...props },
  ref,
) {
  return (
    <HeroSelect.Trigger
      {...props}
      className={cn(variant === 'default' && 'border border-border shadow-none', className)}
      ref={ref}
      variant={variant}
    />
  );
});

const SelectValue = forwardRef<Text, SelectValueProps>(function SelectValue(
  { className, ...props },
  ref,
) {
  return <HeroSelect.Value {...props} className={cn('text-base', className)} ref={ref} />;
});

const SelectItemLabel = forwardRef<Text, SelectItemLabelProps>(function SelectItemLabel(
  { className, ...props },
  ref,
) {
  return <HeroSelect.ItemLabel {...props} className={cn('text-base', className)} ref={ref} />;
});

SelectRoot.displayName = 'Select';
SelectTrigger.displayName = 'Select.Trigger';
SelectValue.displayName = 'Select.Value';
SelectItemLabel.displayName = 'Select.ItemLabel';

export const Select = Object.assign(SelectRoot, {
  Close: HeroSelect.Close,
  Content: HeroSelect.Content,
  Item: HeroSelect.Item,
  ItemDescription: HeroSelect.ItemDescription,
  ItemIndicator: HeroSelect.ItemIndicator,
  ItemLabel: SelectItemLabel,
  ListLabel: HeroSelect.ListLabel,
  Overlay: HeroSelect.Overlay,
  Portal: HeroSelect.Portal,
  Trigger: SelectTrigger,
  TriggerIndicator: HeroSelect.TriggerIndicator,
  Value: SelectValue,
});

export {
  selectClassNames,
  useSelect,
  useSelectAnimation,
  useSelectItem,
} from 'heroui-native/select';
export type * from 'heroui-native/select';

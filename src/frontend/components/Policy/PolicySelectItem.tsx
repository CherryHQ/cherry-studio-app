import {
  Section,
  type SectionItemComponent,
  type SectionItemPressProps,
  type SectionSelectItemProps,
} from '@cherrystudio/ui/components';
import { Text, View } from 'react-native';

import { withPolicy } from './withPolicy';

type SelectOrValueItemProps = SectionSelectItemProps &
  SectionItemPressProps & {
    /** The policy field the row edits. */
    field: string;
    /** Shows the value without the picker. */
    readOnly?: boolean;
  };

function SelectOrValueItem({
  field: _field,
  label,
  onPressedChange,
  readOnly = false,
  value,
  valueLeading,
  ...props
}: SelectOrValueItemProps) {
  if (!readOnly)
    return (
      <Section.SelectItem
        {...props}
        label={label}
        onPressedChange={onPressedChange}
        value={value}
        valueLeading={valueLeading}
      />
    );
  return (
    <Section.Item
      accessibilityLabel={props.accessibilityLabel}
      label={label}
      onPressedChange={onPressedChange}
      testID={props.testID}
      trailing={
        <View className="min-w-0 flex-row items-center justify-end gap-1">
          {valueLeading}
          <Text className="min-w-0 shrink text-right text-base text-foreground" numberOfLines={1}>
            {value}
          </Text>
        </View>
      }
    />
  );
}

/** A selection row whose value is shown read-only once the policy locks its field. */
export const PolicySelectItem = Object.assign(
  withPolicy(SelectOrValueItem, (policy, { field }) => ({ readOnly: !policy.canEdit(field) })),
  { sectionItem: true } satisfies SectionItemComponent,
);

import { type ComponentProps, type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';

import { SelectionIndicator } from '../selection-indicator';

/** Inline choice surface. Callers own selection, submission, and localized copy. */
function Root({ children }: PropsWithChildren) {
  return <View className="w-full gap-3 rounded-2xl bg-card p-4">{children}</View>;
}

function Title({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" className="font-semibold text-foreground text-lg">
      {children}
    </Text>
  );
}

function Options({ children }: PropsWithChildren) {
  return <View className="gap-2">{children}</View>;
}

function Option({
  label,
  description,
  selected,
  selection,
  ...props
}: Omit<ComponentProps<typeof Pressable>, 'children'> & {
  label: string;
  description?: string;
  selected: boolean;
  selection: 'single' | 'multiple';
}) {
  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityRole={selection === 'multiple' ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, disabled: Boolean(props.disabled) }}
      className={`min-h-14 flex-row items-center gap-3 rounded-xl border p-3 ${selected ? 'border-primary bg-primary/10' : 'border-border bg-background'} active:opacity-70`}
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-medium text-foreground text-base">{label}</Text>
        {description ? <Text className="text-muted-foreground text-sm">{description}</Text> : null}
      </View>
      <SelectionIndicator selected={selected} />
    </Pressable>
  );
}

export const QuestionCard = { Root, Title, Options, Option };

import type { ReactNode } from 'react';
import { Pressable, Text, View, type PressableProps } from 'react-native';

export type FileBrowserRowProps = Pick<
  PressableProps,
  | 'accessibilityLabel'
  | 'accessibilityActions'
  | 'accessibilityRole'
  | 'accessibilityState'
  | 'disabled'
  | 'onPress'
  | 'onAccessibilityAction'
  | 'testID'
> & {
  children?: ReactNode;
  description?: string;
  name: string;
  preview: ReactNode;
};

/** File and folder rows share one name column; callers own previews, selection and opening. */
export function FileBrowserRow({
  accessibilityLabel,
  accessibilityRole = 'button',
  children,
  description,
  name,
  preview,
  ...props
}: FileBrowserRowProps) {
  return (
    <Pressable
      {...props}
      accessibilityLabel={accessibilityLabel ?? (description ? `${name}, ${description}` : name)}
      accessibilityRole={accessibilityRole}
      className="min-h-18 flex-row items-center gap-4 py-3 active:opacity-60"
    >
      <View
        accessibilityElementsHidden
        className="size-10 items-center justify-center"
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {preview}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-base text-foreground" ellipsizeMode="middle" numberOfLines={1}>
          {name}
        </Text>
        {description ? (
          <Text className="text-sm text-muted-foreground" ellipsizeMode="middle" numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </Pressable>
  );
}

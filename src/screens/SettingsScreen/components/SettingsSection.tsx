import { Text, View } from 'react-native';

import { SettingsItem, type SettingsItemProps } from './SettingsItem';

type SettingsSectionProps = {
  items: SettingsItemProps[];
  title?: string;
};

export function SettingsSection({ items, title }: SettingsSectionProps) {
  return (
    <View className="gap-2">
      {title ? (
        <Text className="px-1 font-medium text-default-foreground text-sm">{title}</Text>
      ) : null}
      <View className="overflow-hidden rounded-2xl bg-surface-secondary">
        {items.map((item) => (
          <SettingsItem key={item.id ?? item.title} {...item} />
        ))}
      </View>
    </View>
  );
}

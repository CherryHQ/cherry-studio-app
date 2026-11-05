import { LockedMark } from '@cherrystudio/ui/components';
import { Text, View } from 'react-native';

import { type EditionCapabilities, editionCapabilities } from '@/shared/data/managedPolicy';

/**
 * An entry's label, followed by the organization's mark when the organization owns what the entry
 * opens, such as the providers of an enterprise profile.
 */
export function CapabilityLabel({
  capability,
  label,
}: {
  capability: keyof EditionCapabilities;
  label: string;
}) {
  return (
    <View className="min-w-0 flex-row items-center gap-1.5">
      <Text className="shrink text-base text-foreground" numberOfLines={1}>
        {label}
      </Text>
      {editionCapabilities()[capability] ? null : <LockedMark />}
    </View>
  );
}

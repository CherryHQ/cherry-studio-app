import { cn } from '@cherrystudio/ui/utils';
import { View } from 'react-native';

/**
 * The hairline between two rows of a grouped card.
 *
 * Callers draw it *above* a row rather than below, so the rule stays "every row
 * but the first" and needs no knowledge of the list length. It spans the row's
 * padded content, starting under the leading avatar rather than after it.
 */
export function SettingsGroupedSeparator({ hidden = false }: { hidden?: boolean }) {
  return (
    <View
      className={cn('mx-4 h-px bg-border', hidden && 'opacity-0')}
      testID="settings-grouped-separator"
    />
  );
}

import { cn } from '@cherrystudio/ui/utils';
import { View } from 'react-native';

/**
 * The hairline between two rows of a grouped card.
 *
 * Callers draw it *above* a row rather than below, so the rule stays "every row
 * but the first" and needs no knowledge of the list length. The inset matches a
 * row's horizontal padding, which lines the hairline up with the row's content.
 */
export function SettingsGroupedSeparator({ hidden = false }: { hidden?: boolean }) {
  return (
    <View
      className={cn('ml-11 mr-3 h-px bg-border', hidden && 'opacity-0')}
      testID="settings-grouped-separator"
    />
  );
}

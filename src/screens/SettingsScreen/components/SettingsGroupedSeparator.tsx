import { View } from 'react-native';

/**
 * The hairline between two rows of a grouped card.
 *
 * Callers draw it *above* a row rather than below, so the rule stays "every row
 * but the first" and needs no knowledge of the list length. The inset matches a
 * row's horizontal padding, which lines the hairline up with the row's content.
 */
export function SettingsGroupedSeparator() {
  return <View className="mx-4 h-px bg-border" testID="settings-grouped-separator" />;
}

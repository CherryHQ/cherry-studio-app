import { cn } from '@cherrystudio/ui/utils';
import { Text, View } from 'react-native';

const SIZES = {
  default: { frame: 'size-12 rounded-2xl', emoji: 'text-2xl', initial: 'text-xl' },
  large: { frame: 'size-20 rounded-3xl', emoji: 'text-4xl', initial: 'text-3xl' },
} as const;

/**
 * A catalog item's mark: its emoji, or the name's initial, on a quiet rounded tile. The row or
 * page beside it carries the name, so the tile stays out of accessibility.
 */
export function MarketplaceIcon({
  emoji,
  name,
  size = 'default',
}: {
  emoji?: string;
  name: string;
  size?: keyof typeof SIZES;
}) {
  const styles = SIZES[size];
  const mark = emoji?.trim() || Array.from(name.trim())[0]?.toLocaleUpperCase() || '';
  return (
    <View
      accessibilityElementsHidden
      className={cn(
        'shrink-0 items-center justify-center border border-border-subtle bg-card border-continuous',
        styles.frame,
      )}
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        className={cn(
          emoji?.trim() ? styles.emoji : cn(styles.initial, 'font-medium text-foreground'),
        )}
      >
        {mark}
      </Text>
    </View>
  );
}

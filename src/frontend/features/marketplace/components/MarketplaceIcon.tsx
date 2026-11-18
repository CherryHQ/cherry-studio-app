import ToolCaseIcon from '@cherrystudio/app-icons/icons/tool-case';
import { cn } from '@cherrystudio/ui/utils';
import { Text, View } from 'react-native';

const SIZES = {
  default: { frame: 'size-12 rounded-2xl', emoji: 'text-2xl', initial: 'text-xl' },
  large: { frame: 'size-20 rounded-3xl', emoji: 'text-4xl', initial: 'text-3xl' },
} as const;

type MarketplaceIconProps =
  | { kind: 'skill' }
  | { kind: 'template'; emoji?: string; name: string; size?: keyof typeof SIZES };

/** The surrounding row or page supplies the accessible name. */
export function MarketplaceIcon(props: MarketplaceIconProps) {
  const styles = SIZES[props.kind === 'template' ? (props.size ?? 'default') : 'default'];
  const emoji = props.kind === 'template' ? props.emoji?.trim() : undefined;

  return (
    <View
      accessibilityElementsHidden
      className={cn(
        'shrink-0 items-center justify-center border-continuous',
        styles.frame,
        props.kind === 'skill' ? 'bg-secondary' : 'bg-card',
      )}
      importantForAccessibility="no-hide-descendants"
    >
      {props.kind === 'skill' ? (
        <ToolCaseIcon className="size-5 text-muted-foreground" />
      ) : (
        <Text className={emoji ? styles.emoji : cn(styles.initial, 'font-medium text-foreground')}>
          {emoji || Array.from(props.name.trim())[0]?.toLocaleUpperCase()}
        </Text>
      )}
    </View>
  );
}

import { GlobeIcon, SquareArrowOutUpRightIcon } from 'lucide-uniwind/png';
import { Pressable, Text, View } from 'react-native';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

type SourceUrlItemProps = {
  label: string;
  url: string;
  variant?: 'card' | 'listItem';
};

export function SourceUrlItem({ label, url, variant = 'card' }: SourceUrlItemProps) {
  const { domain } = parseSourceUrl(url);
  const containerClassName =
    variant === 'card'
      ? 'flex-row items-center gap-2 rounded-lg border border-border bg-surface-secondary p-3 active:opacity-70'
      : '-mx-2 flex-row items-center gap-2 rounded-md px-2 py-1.5 active:bg-surface-tertiary active:opacity-80';

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="link"
      className={containerClassName}
      onPress={() => void openExternalUrl(url)}
    >
      <View className="size-7 items-center justify-center rounded-md bg-surface-tertiary">
        <GlobeIcon className="size-3.5 text-default-foreground" strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-default-foreground text-sm" numberOfLines={1} selectable>
          {label || url}
        </Text>
        <Text className="text-foreground-tertiary text-xs" numberOfLines={1} selectable>
          {domain || url}
        </Text>
      </View>
      <SquareArrowOutUpRightIcon className="size-3.5 text-foreground-tertiary" strokeWidth={2} />
    </Pressable>
  );
}

function parseSourceUrl(url: string): { domain: string; hostname: string } {
  try {
    const hostname = new URL(url).hostname;
    return { domain: hostname.replace(/^www\./, ''), hostname };
  } catch {
    return { domain: url, hostname: '' };
  }
}

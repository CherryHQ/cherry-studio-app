import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { type MarketplaceEntry, MarketplaceRow } from './MarketplaceRow';
import { useMarketplaceColumns } from './useMarketplaceColumns';

/** Maximum preview rows per column. */
const PREVIEW_ROWS = 3;

/**
 * A titled collection preview. The title opens the full list when more entries are available.
 * Without entries, `state` takes the rows' place.
 */
export function MarketplaceSection({
  entries,
  hasNextPage = false,
  onOpen,
  state,
  testID,
  title,
}: {
  entries: readonly MarketplaceEntry[];
  hasNextPage?: boolean;
  onOpen(): void;
  state?: ReactNode;
  testID?: string;
  title: string;
}) {
  const columns = useMarketplaceColumns();
  const isCardLayout = columns >= 2;
  const preview = entries.slice(0, PREVIEW_ROWS * columns);
  const rows = Array.from({ length: Math.ceil(preview.length / columns) }, (_, index) =>
    preview.slice(index * columns, (index + 1) * columns),
  );
  const hasMoreEntries = preview.length < entries.length || hasNextPage;
  const heading = (
    <Text accessibilityRole="header" className="shrink text-sm font-medium text-muted-foreground">
      {title}
    </Text>
  );

  return (
    <View
      className={isCardLayout ? 'mx-auto w-full max-w-[880px] gap-2 px-4' : 'gap-1'}
      testID={testID}
    >
      {hasMoreEntries ? (
        <Pressable
          accessibilityLabel={title}
          accessibilityRole="button"
          className={
            isCardLayout
              ? 'flex-row items-center gap-1 self-start py-2 active:opacity-60'
              : 'flex-row items-center gap-1 self-start px-4 py-2 active:opacity-60'
          }
          hitSlop={8}
          onPress={onOpen}
          testID={testID ? `${testID}-open` : undefined}
        >
          {heading}
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        </Pressable>
      ) : (
        <View className={isCardLayout ? 'py-2' : 'px-4 py-2'}>{heading}</View>
      )}
      {rows.length ? null : <View className="px-8 py-6">{state}</View>}
      <View className={isCardLayout ? 'gap-2.5' : undefined}>
        {rows.map((row) => (
          <View className={isCardLayout ? 'flex-row gap-3' : 'flex-row'} key={row[0]!.key}>
            {row.map((entry) => (
              <View
                className={isCardLayout ? 'min-w-0 flex-1' : 'min-w-0 flex-1 px-4'}
                key={entry.key}
              >
                <MarketplaceRow entry={entry} isCard={isCardLayout} />
              </View>
            ))}
            {row.length < columns ? <View className="flex-1" /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

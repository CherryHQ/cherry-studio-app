import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import { useLayoutWidth } from '@/frontend/hooks/useLayoutWidth';

import { splitTextBlocks, type TextBlockLimits } from '../utils/textBlocks';

const pagePadding = 16;
// A native text view lays out and draws its whole block, so a large file is read through bounded
// blocks that mount only near the viewport. Source rows continue past 240 characters so a block
// stays a few screens wide.
const plainTextLimits: TextBlockLimits = {
  maxBlockLength: 1000,
  maxBlockLines: 20,
  maxLineLength: 1000,
};
const sourceLimits: TextBlockLimits = {
  maxBlockLength: 2000,
  maxBlockLines: 20,
  maxLineLength: 240,
};
const estimatedBlockHeight = 480;

export function FileTextBody({
  text,
  variant,
}: {
  text: string;
  variant: 'markdown' | 'source' | 'text';
}) {
  if (variant === 'markdown') {
    return (
      <ScrollView className="flex-1" contentContainerClassName="p-4 pb-safe-offset-4">
        <MarkdownText markdown={text} selectable={false} />
      </ScrollView>
    );
  }

  return variant === 'text' ? <PlainTextBody text={text} /> : <SourceTextBody text={text} />;
}

function PlainTextBody({ text }: { text: string }) {
  const blocks = useMemo(() => splitTextBlocks(text, plainTextLimits), [text]);
  const contentContainerStyle = usePageContentStyle(pagePadding);

  return (
    <LegendList
      contentContainerStyle={contentContainerStyle}
      data={blocks}
      estimatedItemSize={estimatedBlockHeight}
      keyExtractor={blockKeyExtractor}
      recycleItems
      renderItem={renderPlainTextBlock}
      style={styles.list}
    />
  );
}

/**
 * Long source lines scroll sideways instead of wrapping. The list is as wide as its longest row,
 * which an invisible copy of that row measures; the horizontal scroll view stretches it to the
 * page height.
 */
function SourceTextBody({ text }: { text: string }) {
  const blocks = useMemo(() => splitTextBlocks(text, sourceLimits), [text]);
  const longestRow = useMemo(() => {
    let longest = '';
    for (const row of text.split('\n')) {
      if (row.length > longest.length) longest = row.slice(0, sourceLimits.maxLineLength);
    }
    return longest;
  }, [text]);
  const { onLayout, width } = useLayoutWidth();
  const contentContainerStyle = usePageContentStyle(0);

  return (
    <ScrollView horizontal onLayout={onLayout} style={styles.list}>
      <View style={{ minWidth: width, paddingHorizontal: pagePadding }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.ruler}
        >
          <Text className="font-mono text-base" numberOfLines={1}>
            {longestRow}
          </Text>
        </View>
        <LegendList
          contentContainerStyle={contentContainerStyle}
          data={blocks}
          estimatedItemSize={estimatedBlockHeight}
          keyExtractor={blockKeyExtractor}
          recycleItems
          renderItem={renderSourceBlock}
          style={styles.list}
        />
      </View>
    </ScrollView>
  );
}

function usePageContentStyle(paddingHorizontal: number) {
  const { bottom } = useSafeAreaInsets();
  return useMemo(
    () => ({ paddingBottom: bottom + pagePadding, paddingHorizontal, paddingTop: pagePadding }),
    [bottom, paddingHorizontal],
  );
}

function blockKeyExtractor(_block: string, index: number) {
  return String(index);
}

function renderPlainTextBlock({ item }: LegendListRenderItemProps<string>) {
  return (
    <Text className="text-base text-foreground" selectable={false}>
      {item}
    </Text>
  );
}

function renderSourceBlock({ item }: LegendListRenderItemProps<string>) {
  return (
    <Text className="font-mono text-base text-foreground" selectable={false}>
      {item}
    </Text>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  ruler: { height: 0, opacity: 0, overflow: 'hidden' },
});

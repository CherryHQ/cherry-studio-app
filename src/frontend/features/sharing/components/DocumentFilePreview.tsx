import CodeXmlIcon from '@cherrystudio/app-icons/icons/code-xml';
import FileTextIcon from '@cherrystudio/app-icons/icons/file-text';
import { splitTextBlocks } from '@cherrystudio/ui/utils';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { type PropsWithChildren, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

/** One preview container: file identity above either raw Markdown or rendered HTML. */
export function DocumentFilePreview({
  children,
  filename,
  messageCount,
  source,
  format,
}: PropsWithChildren<{
  filename: string;
  messageCount?: number;
  source: string;
  format: 'html' | 'markdown';
}>) {
  const { t, i18n } = useTranslation();
  const bytes = useMemo(() => new TextEncoder().encode(source).byteLength, [source]);
  const unit = bytes >= 1_000_000 ? 'MB' : bytes >= 1000 ? 'KB' : 'B';
  const amount = bytes / (unit === 'MB' ? 1_000_000 : unit === 'KB' ? 1000 : 1);
  const size = `${new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 }).format(amount)} ${unit}`;
  const Icon = format === 'html' ? CodeXmlIcon : FileTextIcon;
  return (
    <View className="min-h-0 flex-1">
      <View className="flex-row items-center gap-2.5 border-border-subtle border-b px-4 py-3.5">
        <View className="size-9 items-center justify-center rounded-xl bg-secondary">
          <Icon className="size-5 text-foreground" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="font-semibold text-foreground text-sm" numberOfLines={1}>
            {filename}
          </Text>
          <Text className="text-muted-foreground text-xs">
            {messageCount === undefined
              ? size
              : `${t('sharing.messageCount', { count: messageCount })} · ${size}`}
          </Text>
        </View>
      </View>
      {format === 'markdown' ? <MarkdownSourcePreview source={source} /> : children}
    </View>
  );
}

function MarkdownSourcePreview({ source }: { source: string }) {
  const blocks = useMemo(() => splitTextBlocks(source), [source]);
  return (
    <LegendList
      data={blocks}
      keyExtractor={sourceBlockKey}
      estimatedItemSize={400}
      nestedScrollEnabled
      recycleItems={false}
      renderItem={renderSourceBlock}
      contentContainerStyle={styles.content}
      style={styles.list}
    />
  );
}

// The immutable file stays in source order; blocks are never reordered or recycled.
function sourceBlockKey(_block: string, index: number) {
  return String(index);
}
function renderSourceBlock({ item }: LegendListRenderItemProps<string>) {
  return (
    <Text selectable className="font-mono text-foreground" style={styles.source}>
      {item}
    </Text>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { padding: 20 },
  source: { fontSize: 12.5, lineHeight: 20 },
});

import { Input } from 'heroui-native/input';
import { PlusIcon, Trash2Icon } from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

export type HeaderRow = {
  key: string;
  value: string;
};

type McpHeadersEditorProps = {
  onChange: (rows: HeaderRow[]) => void;
  rows: HeaderRow[];
};

/** Collapse rows into a header record, dropping empty keys (last write wins). */
export function headerRowsToRecord(rows: HeaderRow[]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) {
      record[key] = row.value;
    }
  }
  return record;
}

export function recordToHeaderRows(record: Record<string, string> | undefined): HeaderRow[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }));
}

export function McpHeadersEditor({ onChange, rows }: McpHeadersEditorProps) {
  const { t } = useTranslation();

  const updateRow = useCallback(
    (index: number, patch: Partial<HeaderRow>) => {
      onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    },
    [onChange, rows],
  );

  const removeRow = useCallback(
    (index: number) => {
      onChange(rows.filter((_, i) => i !== index));
    },
    [onChange, rows],
  );

  const addRow = useCallback(() => {
    onChange([...rows, { key: '', value: '' }]);
  }, [onChange, rows]);

  return (
    <View className="gap-2">
      {rows.length === 0 ? (
        <Text className="text-default-foreground text-xs">{t('settings.mcp.headers.empty')}</Text>
      ) : (
        rows.map((row, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and reorder-free
          <View className="flex-row items-center gap-2" key={index}>
            <Input
              accessibilityLabel={t('settings.mcp.headers.name')}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 rounded-xl px-3 font-mono text-foreground text-sm"
              onChangeText={(value) => updateRow(index, { key: value })}
              placeholder={t('settings.mcp.headers.name')}
              placeholderColorClassName="accent-muted"
              spellCheck={false}
              value={row.key}
              variant="secondary"
            />
            <Input
              accessibilityLabel={t('settings.mcp.headers.value')}
              autoCapitalize="none"
              autoCorrect={false}
              className="flex-1 rounded-xl px-3 text-foreground text-sm"
              onChangeText={(value) => updateRow(index, { value })}
              placeholder={t('settings.mcp.headers.value')}
              placeholderColorClassName="accent-muted"
              spellCheck={false}
              value={row.value}
              variant="secondary"
            />
            <Pressable
              accessibilityLabel={t('common.delete')}
              accessibilityRole="button"
              className="size-9 items-center justify-center rounded-xl active:opacity-60"
              onPress={() => removeRow(index)}
            >
              <Trash2Icon className="size-5 text-danger-foreground" strokeWidth={2} />
            </Pressable>
          </View>
        ))
      )}
      <Pressable
        accessibilityLabel={t('settings.mcp.headers.add')}
        accessibilityRole="button"
        className="min-h-10 flex-row items-center gap-2 self-start active:opacity-60"
        onPress={addRow}
      >
        <PlusIcon className="size-5 text-accent" strokeWidth={2} />
        <Text className="font-medium text-accent text-sm">{t('settings.mcp.headers.add')}</Text>
      </Pressable>
    </View>
  );
}

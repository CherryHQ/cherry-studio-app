import { Text, View } from 'react-native';

const DEFAULT_MAX_VALUE_LENGTH = 4000;

export function ToolPartValueSection({
  maxLength = DEFAULT_MAX_VALUE_LENGTH,
  title,
  value,
}: {
  maxLength?: number;
  title: string;
  value: unknown;
}) {
  const entries = getValueEntries(value);
  if (entries.length === 0) {
    return null;
  }

  return (
    <View className="gap-1">
      <ToolPartSectionTitle title={title} />
      <View className="gap-1">
        {entries.map(([key, entryValue]) => (
          <View className="flex-row gap-2" key={key}>
            <Text className="w-20 shrink-0 font-mono text-default-foreground text-base" selectable>
              {key}
            </Text>
            <Text className="min-w-0 flex-1 font-mono text-default-foreground text-base" selectable>
              {formatToolPartValue(entryValue, maxLength)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ToolPartTextSection({
  title,
  tone,
  value,
}: {
  title: string;
  tone?: 'error';
  value: string;
}) {
  return (
    <View className="gap-1">
      <ToolPartSectionTitle title={title} />
      <Text
        className={
          tone === 'error'
            ? 'font-mono text-danger text-base'
            : 'font-mono text-default-foreground text-base'
        }
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

export function ToolPartSectionTitle({ title }: { title: string }) {
  return (
    <Text className="text-default-foreground text-base" selectable>
      {title}
    </Text>
  );
}

export function hasToolPartValue(value: unknown): boolean {
  return getValueEntries(value).length > 0;
}

export function formatToolPartValue(value: unknown, maxLength = DEFAULT_MAX_VALUE_LENGTH): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'string') return truncateText(value, maxLength);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();

  try {
    return truncateText(JSON.stringify(value, null, 2), maxLength);
  } catch {
    return truncateText(String(value), maxLength);
  }
}

function getValueEntries(value: unknown): [string, unknown][] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return [['value', value]];
  if (isRecord(value)) return Object.entries(value);
  return [['value', value]];
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n... truncated (${text.length} chars)`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

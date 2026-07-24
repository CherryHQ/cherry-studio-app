import { Accordion } from 'heroui-native/accordion';
import { WrenchIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import type { CherryMessagePart } from '@/data/types/message';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

type ToolPartProps = {
  part: ToolMessagePart;
};

const MAX_VALUE_LENGTH = 4000;

export function ToolPart({ part }: ToolPartProps) {
  const { t } = useTranslation();
  const toolName = getToolName(part);
  const title = getToolLabel(part, t);
  const statusText = getToolStatusText(part, t);
  const isRunning =
    part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    (part.state === 'approval-responded' && part.approval.approved);

  return (
    <Accordion
      className="overflow-hidden rounded-lg border border-border bg-surface-secondary"
      hideSeparator
      isCollapsible
      selectionMode="single"
    >
      <Accordion.Item value={`tool-${toolName}`}>
        <Accordion.Trigger className="min-h-0 px-3 py-3">
          <ToolHeaderContent isRunning={isRunning} statusText={statusText} title={title} />
          <Accordion.Indicator
            animation={{ rotation: { value: [-90, 0] } }}
            iconProps={{ size: 16 }}
          />
        </Accordion.Trigger>
        <Accordion.Content className="px-3 pt-0 pb-3">
          <View className="gap-2.5 border-border border-t pt-2">
            <ToolValueSection title={t('chat.tool.arguments')} value={part.input} />
            {part.state === 'output-available' ? <ToolOutputSection output={part.output} /> : null}
            {part.state === 'output-error' ? (
              <ToolTextSection tone="error" title={t('chat.tool.error')} value={part.errorText} />
            ) : null}
            {shouldShowNoDetails(part) ? (
              <Text className="text-foreground-muted text-xs italic" selectable>
                {t('chat.tool.noOutput')}
              </Text>
            ) : null}
          </View>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}

function ToolHeaderContent({
  isRunning,
  statusText,
  title,
}: {
  isRunning: boolean;
  statusText: string;
  title: string;
}) {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      {isRunning ? (
        <ActivityIndicator size="small" />
      ) : (
        <WrenchIcon className="size-4 text-default-foreground" strokeWidth={2} />
      )}
      <Text
        className="min-w-0 flex-1 font-semibold text-default-foreground text-sm"
        numberOfLines={1}
        selectable
      >
        {title}
      </Text>
      <Text
        className="max-w-[42%] shrink-0 text-foreground-muted text-xs"
        numberOfLines={1}
        selectable
      >
        {statusText}
      </Text>
    </View>
  );
}

function ToolOutputSection({ output }: { output: unknown }) {
  const { t } = useTranslation();

  if (
    output === undefined ||
    output === null ||
    (isRecord(output) && Object.keys(output).length === 0)
  ) {
    return (
      <Text className="text-foreground-muted text-xs italic" selectable>
        {t('chat.tool.noOutput')}
      </Text>
    );
  }

  return <ToolValueSection title={t('chat.tool.output')} value={output} />;
}

function ToolValueSection({ title, value }: { title: string; value: unknown }) {
  const entries = getValueEntries(value);

  if (entries.length === 0) return null;

  return (
    <View className="gap-1">
      <SectionTitle title={title} />
      <View className="gap-1 rounded-md bg-surface-tertiary p-2">
        {entries.map(([key, entryValue]) => (
          <View className="flex-row gap-2" key={key}>
            <Text className="w-20 shrink-0 font-mono text-foreground-muted text-xs" selectable>
              {key}
            </Text>
            <Text className="min-w-0 flex-1 font-mono text-default-foreground text-xs" selectable>
              {formatDisplayValue(entryValue)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ToolTextSection({ title, tone, value }: { title: string; tone?: 'error'; value: string }) {
  return (
    <View className="gap-1">
      <SectionTitle title={title} />
      <View className="rounded-md bg-surface-tertiary p-2">
        <Text
          className={
            tone === 'error'
              ? 'font-mono text-danger text-xs leading-5'
              : 'font-mono text-default-foreground text-xs leading-5'
          }
          selectable
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text className="text-foreground-muted text-xs" selectable>
      {title}
    </Text>
  );
}

function getToolLabel(part: ToolMessagePart, t: ReturnType<typeof useTranslation>['t']) {
  const title = part.title?.trim();
  if (title) return title;

  return t('chat.tool.title', { name: getToolName(part) });
}

function getToolStatusText(part: ToolMessagePart, t: ReturnType<typeof useTranslation>['t']) {
  if (part.state === 'input-streaming') {
    return t('chat.tool.preparingInput');
  }

  if (part.state === 'input-available') {
    return t('chat.tool.inputReady');
  }

  if (part.state === 'approval-requested') {
    return t('chat.tool.approvalRequested');
  }

  if (part.state === 'approval-responded') {
    return part.approval.approved ? t('chat.tool.approved') : t('chat.tool.denied');
  }

  if (part.state === 'output-available') {
    return part.preliminary ? t('chat.tool.preliminaryOutputReady') : t('chat.tool.outputReady');
  }

  if (part.state === 'output-error') {
    return part.errorText;
  }

  return t('chat.tool.outputDenied');
}

function shouldShowNoDetails(part: ToolMessagePart) {
  return (
    part.state !== 'output-error' &&
    part.state !== 'output-available' &&
    getValueEntries(part.input).length === 0
  );
}

function getValueEntries(value: unknown): [string, unknown][] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return [['value', value]];
  if (isRecord(value)) return Object.entries(value);
  return [['value', value]];
}

function formatDisplayValue(value: unknown) {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'string') return truncateText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();

  try {
    return truncateText(JSON.stringify(value, null, 2));
  } catch {
    return truncateText(String(value));
  }
}

function truncateText(text: string) {
  if (text.length <= MAX_VALUE_LENGTH) return text;
  return `${text.slice(0, MAX_VALUE_LENGTH)}\n... truncated (${text.length} chars)`;
}

function getToolName(part: ToolMessagePart) {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

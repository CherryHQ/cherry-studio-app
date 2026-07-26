import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { CherryMessagePart } from '@/data/types/message';
import { ToolPartSheet, ToolPartTrigger } from './ToolPartSheet';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

type ToolPartProps = {
  part: ToolMessagePart;
};

const MAX_VALUE_LENGTH = 4000;

export function ToolPart({ part }: ToolPartProps) {
  const { t } = useTranslation();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const title = getToolLabel(part, t);
  const statusText = getToolStatusText(part, t);
  const isRunning =
    part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    (part.state === 'approval-responded' && part.approval.approved);

  return (
    <View className="gap-1.5">
      <ToolPartTrigger
        isRunning={isRunning}
        onPress={() => setIsSheetOpen(true)}
        statusText={statusText}
        statusTone={getToolStatusTone(part)}
        testID="tool-part-trigger"
        title={title}
      />
      {isSheetOpen ? (
        <ToolPartSheet
          onClose={() => setIsSheetOpen(false)}
          testID="tool-part-detail"
          title={title}
        >
          <ToolValueSection title={t('chat.tool.arguments')} value={part.input} />
          {part.state === 'output-available' ? <ToolOutputSection output={part.output} /> : null}
          {part.state === 'output-error' ? (
            <ToolTextSection tone="error" title={t('chat.tool.error')} value={part.errorText} />
          ) : null}
          {shouldShowNoDetails(part) ? (
            <Text className="text-default-foreground text-md italic" selectable>
              {t('chat.tool.noOutput')}
            </Text>
          ) : null}
        </ToolPartSheet>
      ) : null}
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
      <Text className="text-default-foreground text-md italic" selectable>
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
      <View className="gap-1">
        {entries.map(([key, entryValue]) => (
          <View className="flex-row gap-2" key={key}>
            <Text className="w-20 shrink-0 font-mono text-default-foreground text-md" selectable>
              {key}
            </Text>
            <Text className="min-w-0 flex-1 font-mono text-default-foreground text-md" selectable>
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
      <Text
        className={
          tone === 'error'
            ? 'font-mono text-danger text-md leading-5'
            : 'font-mono text-default-foreground text-md leading-5'
        }
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <Text className="text-default-foreground text-md" selectable>
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
    return part.approval.approved ? t('chat.tool.approved') : t('chat.tool.runDenied');
  }

  if (part.state === 'output-available') {
    return undefined;
  }

  if (part.state === 'output-error') {
    return t('chat.tool.callError');
  }

  return t('chat.tool.runDenied');
}

function getToolStatusTone(part: ToolMessagePart): 'danger' | 'default' | 'warning' {
  if (
    part.state === 'output-denied' ||
    (part.state === 'approval-responded' && !part.approval.approved)
  ) {
    return 'warning';
  }

  return part.state === 'output-error' ? 'danger' : 'default';
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

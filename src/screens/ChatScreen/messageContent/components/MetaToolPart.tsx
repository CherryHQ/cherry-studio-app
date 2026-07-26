import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { CherryMessagePart } from '@/data/types/message';
import { ToolPartSheet, ToolPartTrigger } from './ToolPartSheet';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

type MetaToolPartProps = {
  part: ToolMessagePart;
};

type MetaToolName = 'tool_search' | 'tool_inspect' | 'tool_invoke' | 'tool_exec';

type ToolSearchNamespace = {
  namespace: string;
  tools: { name: string }[];
};

const META_TOOL_NAMES = new Set<MetaToolName>([
  'tool_search',
  'tool_inspect',
  'tool_invoke',
  'tool_exec',
]);
const META_TOOL_TITLES: Record<MetaToolName, string> = {
  tool_exec: 'Tool Exec',
  tool_inspect: 'Tool Inspect',
  tool_invoke: 'Tool Invoke',
  tool_search: 'Tool Search',
};

const MAX_VALUE_LENGTH = 4000;

export function MetaToolPart({ part }: MetaToolPartProps) {
  const { t } = useTranslation();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const toolName = getToolName(part) as MetaToolName;
  const input = isRecord(part.input) ? part.input : undefined;
  const statusText = getMetaToolStatusText(part, toolName, t);
  const title = META_TOOL_TITLES[toolName];
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
        statusTone={getMetaToolStatusTone(part)}
        testID="meta-tool-part-trigger"
        title={title}
      />
      {isSheetOpen ? (
        <ToolPartSheet
          onClose={() => setIsSheetOpen(false)}
          testID="meta-tool-part-detail"
          title={title}
        >
          <MetaToolBody input={input} part={part} toolName={toolName} />
        </ToolPartSheet>
      ) : null}
    </View>
  );
}

function MetaToolBody({
  input,
  part,
  toolName,
}: {
  input?: Record<string, unknown>;
  part: ToolMessagePart;
  toolName: MetaToolName;
}) {
  if (toolName === 'tool_search') {
    return <ToolSearchBody input={input} part={part} />;
  }

  if (toolName === 'tool_inspect') {
    return <ToolInspectBody input={input} part={part} />;
  }

  if (toolName === 'tool_invoke') {
    return <ToolInvokeBody input={input} part={part} />;
  }

  return <ToolExecBody input={input} part={part} />;
}

function ToolSearchBody({
  input,
  part,
}: {
  input?: Record<string, unknown>;
  part: ToolMessagePart;
}) {
  const { t } = useTranslation();
  const namespaces =
    part.state === 'output-available' ? parseToolSearchNamespaces(part.output) : [];

  return (
    <>
      <ToolValueSection title={t('chat.tool.arguments')} value={input} />
      {part.state === 'output-available' && namespaces.length === 0 ? (
        <Text className="text-default-foreground text-md italic" selectable>
          {t('chat.metaToolSearch.noResults')}
        </Text>
      ) : null}
      {namespaces.map((group) => (
        <View className="gap-1.5" key={group.namespace}>
          <Text className="text-default-foreground text-md" selectable>
            {group.namespace} ({group.tools.length})
          </Text>
          <View className="flex-row flex-wrap gap-1">
            {group.tools.map((tool) => (
              <View className="max-w-full" key={`${group.namespace}-${tool.name}`}>
                <Text
                  className="font-mono text-default-foreground text-md"
                  numberOfLines={1}
                  selectable
                >
                  {tool.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

function ToolInspectBody({
  input,
  part,
}: {
  input?: Record<string, unknown>;
  part: ToolMessagePart;
}) {
  const { t } = useTranslation();

  return (
    <>
      <ToolValueSection title={t('chat.tool.arguments')} value={input} />
      {part.state === 'output-available' ? (
        <ToolTextSection
          title={t('chat.tool.jsdoc')}
          value={formatDisplayValue(part.output, true)}
        />
      ) : null}
      {part.state === 'output-error' ? (
        <ToolTextSection tone="error" title={t('chat.tool.error')} value={part.errorText} />
      ) : null}
    </>
  );
}

function ToolInvokeBody({
  input,
  part,
}: {
  input?: Record<string, unknown>;
  part: ToolMessagePart;
}) {
  const { t } = useTranslation();
  const params = isRecord(input?.params) ? input.params : undefined;

  return (
    <>
      <ToolValueSection title={t('chat.tool.arguments')} value={params ?? input} />
      {part.state === 'output-available' ? (
        <ToolTextSection
          title={t('chat.tool.response')}
          value={formatDisplayValue(part.output, true)}
        />
      ) : null}
      {part.state === 'output-error' ? (
        <ToolTextSection tone="error" title={t('chat.tool.error')} value={part.errorText} />
      ) : null}
    </>
  );
}

function ToolExecBody({ input, part }: { input?: Record<string, unknown>; part: ToolMessagePart }) {
  const { t } = useTranslation();
  const code = typeof input?.code === 'string' ? input.code : undefined;
  const output =
    part.state === 'output-available' && isRecord(part.output) ? part.output : undefined;
  const logs = Array.isArray(output?.logs)
    ? output.logs.filter((item): item is string => typeof item === 'string')
    : [];

  return (
    <>
      {code ? (
        <ToolTextSection title={t('chat.tool.code')} value={code} />
      ) : (
        <ToolValueSection title={t('chat.tool.arguments')} value={input} />
      )}
      {logs.length > 0 ? (
        <ToolTextSection title={t('chat.tool.logs')} value={logs.join('\n')} />
      ) : null}
      {typeof output?.error === 'string' ? (
        <ToolTextSection tone="error" title={t('chat.tool.error')} value={output.error} />
      ) : null}
      {output?.result !== undefined ? (
        <ToolTextSection
          title={t('chat.tool.result')}
          value={formatDisplayValue(output.result, true)}
        />
      ) : null}
      {part.state === 'output-available' && !output ? (
        <ToolTextSection
          title={t('chat.tool.response')}
          value={formatDisplayValue(part.output, true)}
        />
      ) : null}
      {part.state === 'output-error' ? (
        <ToolTextSection tone="error" title={t('chat.tool.error')} value={part.errorText} />
      ) : null}
    </>
  );
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

export function isMetaToolPart(part: ToolMessagePart) {
  return META_TOOL_NAMES.has(getToolName(part) as MetaToolName);
}

function getMetaToolStatusText(
  part: ToolMessagePart,
  toolName: MetaToolName,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (part.state === 'output-available') {
    if (toolName === 'tool_search') {
      const namespaces = parseToolSearchNamespaces(part.output);
      const toolCount = namespaces.reduce((count, group) => count + group.tools.length, 0);
      return toolCount === 0
        ? t('chat.metaToolSearch.noResults')
        : t('chat.metaToolSearch.resultCount', { count: toolCount });
    }

    if (toolName === 'tool_inspect' || toolName === 'tool_invoke') {
      const input = isRecord(part.input) ? part.input : undefined;
      const targetToolName = typeof input?.name === 'string' ? input.name.trim() : '';
      return targetToolName || undefined;
    }

    return undefined;
  }

  if (part.state === 'output-error') {
    return t('chat.tool.callError');
  }

  if (part.state === 'output-denied') {
    return t('chat.tool.runDenied');
  }

  if (part.state === 'approval-requested') {
    return t('chat.tool.approvalRequested');
  }

  if (part.state === 'approval-responded') {
    return part.approval.approved ? t('chat.tool.approved') : t('chat.tool.runDenied');
  }

  return toolName === 'tool_search' ? t('chat.metaToolSearch.searching') : t('chat.tool.running');
}

function getMetaToolStatusTone(part: ToolMessagePart): 'danger' | 'default' | 'warning' {
  if (
    part.state === 'output-denied' ||
    (part.state === 'approval-responded' && !part.approval.approved)
  ) {
    return 'warning';
  }

  return part.state === 'output-error' ? 'danger' : 'default';
}

function parseToolSearchNamespaces(output: unknown): ToolSearchNamespace[] {
  if (!isRecord(output) || !Array.isArray(output.matchedNamespaces)) {
    return [];
  }

  return output.matchedNamespaces.flatMap((group) => {
    if (!isRecord(group) || typeof group.namespace !== 'string') {
      return [];
    }

    const tools = Array.isArray(group.tools)
      ? group.tools.flatMap((tool) =>
          isRecord(tool) && typeof tool.name === 'string' && tool.name.trim()
            ? [{ name: tool.name }]
            : [],
        )
      : [];

    return [{ namespace: group.namespace, tools }];
  });
}

function getValueEntries(value: unknown): [string, unknown][] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return [['arguments', value]];
  if (isRecord(value)) return Object.entries(value);
  return [['arguments', value]];
}

function formatDisplayValue(value: unknown, pretty = false) {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'string') return truncateText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();

  try {
    return truncateText(JSON.stringify(value, null, pretty ? 2 : undefined));
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

import { Accordion } from 'heroui-native/accordion';
import { WrenchIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import type { CherryMessagePart } from '@/data/types/message';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

type MetaToolPartProps = {
  part: ToolMessagePart;
};

type MetaToolName = 'tool_search' | 'tool_inspect' | 'tool_invoke' | 'tool_exec';

type ToolSearchNamespace = {
  namespace: string;
  tools: Array<{ name: string }>;
};

const META_TOOL_NAMES = new Set<MetaToolName>([
  'tool_search',
  'tool_inspect',
  'tool_invoke',
  'tool_exec',
]);

const MAX_VALUE_LENGTH = 4000;

export function MetaToolPart({ part }: MetaToolPartProps) {
  const { t } = useTranslation();
  const toolName = getToolName(part) as MetaToolName;
  const input = isRecord(part.input) ? part.input : undefined;
  const statusText = getMetaToolStatusText(part, toolName, t);
  const title = getMetaToolTitle(toolName, input, part.title?.trim());
  const isRunning = part.state === 'input-streaming' || part.state === 'input-available';

  return (
    <Accordion
      className="overflow-hidden rounded-lg border border-border bg-surface-secondary"
      hideSeparator
      isCollapsible
      selectionMode="single"
    >
      <Accordion.Item value={`meta-tool-${toolName}`}>
        <Accordion.Trigger className="min-h-0 px-3 py-3">
          <MetaToolHeaderContent isRunning={isRunning} statusText={statusText} title={title} />
          <Accordion.Indicator
            animation={{ rotation: { value: [-90, 0] } }}
            iconProps={{ size: 16 }}
          />
        </Accordion.Trigger>
        <Accordion.Content className="px-3 pt-0 pb-3">
          <View className="gap-2.5 border-border border-t pt-2">
            <MetaToolBody input={input} part={part} toolName={toolName} />
          </View>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}

function MetaToolHeaderContent({
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
        <Text className="text-foreground-muted text-xs italic" selectable>
          {t('chat.metaToolSearch.noResults')}
        </Text>
      ) : null}
      {namespaces.map((group) => (
        <View className="gap-1.5" key={group.namespace}>
          <Text className="text-foreground-muted text-xs" selectable>
            {group.namespace} ({group.tools.length})
          </Text>
          <View className="flex-row flex-wrap gap-1">
            {group.tools.map((tool) => (
              <View
                className="max-w-full rounded-md border border-border bg-surface-tertiary px-1.5 py-0.5"
                key={`${group.namespace}-${tool.name}`}
              >
                <Text
                  className="font-mono text-default-foreground text-xs"
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

export function isMetaToolPart(part: ToolMessagePart) {
  return META_TOOL_NAMES.has(getToolName(part) as MetaToolName);
}

function getMetaToolTitle(
  toolName: MetaToolName,
  args: Record<string, unknown> | undefined,
  fallback?: string,
) {
  const argName = typeof args?.name === 'string' ? args.name.trim() : '';

  if (toolName === 'tool_search') {
    const query = typeof args?.query === 'string' ? args.query.trim() : '';
    const namespace = typeof args?.namespace === 'string' ? args.namespace.trim() : '';
    const parts = [query ? `"${query}"` : '', namespace ? `ns=${namespace}` : ''].filter(Boolean);
    return parts.length > 0 ? `${toolName} - ${parts.join(' - ')}` : fallback || toolName;
  }

  if ((toolName === 'tool_inspect' || toolName === 'tool_invoke') && argName) {
    return `${toolName} - ${argName}`;
  }

  return fallback || toolName;
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

    return part.preliminary ? t('chat.tool.preliminaryOutputReady') : t('chat.tool.outputReady');
  }

  if (part.state === 'output-error') {
    return part.errorText;
  }

  if (part.state === 'output-denied') {
    return t('chat.tool.outputDenied');
  }

  if (part.state === 'approval-requested') {
    return t('chat.tool.approvalRequested');
  }

  if (part.state === 'approval-responded') {
    return part.approval.approved ? t('chat.tool.approved') : t('chat.tool.denied');
  }

  return toolName === 'tool_search' ? t('chat.metaToolSearch.searching') : t('chat.tool.running');
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

function getValueEntries(value: unknown): Array<[string, unknown]> {
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

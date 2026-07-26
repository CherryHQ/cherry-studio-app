import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { CherryMessagePart } from '@/data/types/message';
import { formatToolPartValue, ToolPartTextSection, ToolPartValueSection } from './ToolPartDetails';
import { ToolPartDisclosure } from './ToolPartDisclosure';

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
const META_TOOL_TITLE_KEYS = {
  tool_exec: 'chat.metaToolExec.title',
  tool_inspect: 'chat.metaToolInspect.title',
  tool_invoke: 'chat.metaToolInvoke.title',
  tool_search: 'chat.metaToolSearch.title',
};

export function MetaToolPart({ part }: MetaToolPartProps) {
  const { t } = useTranslation();
  const toolName = getToolName(part) as MetaToolName;
  const input = isRecord(part.input) ? part.input : undefined;
  const statusText = getMetaToolStatusText(part, toolName, t);
  const title = t(META_TOOL_TITLE_KEYS[toolName]);
  const isRunning =
    part.state === 'input-streaming' ||
    part.state === 'input-available' ||
    (part.state === 'approval-responded' && part.approval.approved);

  return (
    <ToolPartDisclosure
      isRunning={isRunning}
      statusText={statusText}
      statusTone={getMetaToolStatusTone(part)}
      testIDPrefix="meta-tool-part"
      title={title}
    >
      <MetaToolBody input={input} part={part} toolName={toolName} />
    </ToolPartDisclosure>
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
      <ToolPartValueSection title={t('chat.tool.arguments')} value={input} />
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
      {part.state === 'output-error' ? (
        <ToolPartTextSection tone="error" title={t('chat.tool.error')} value={part.errorText} />
      ) : null}
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
      <ToolPartValueSection title={t('chat.tool.arguments')} value={input} />
      {part.state === 'output-available' ? (
        <ToolPartTextSection
          title={t('chat.tool.jsdoc')}
          value={formatToolPartValue(part.output)}
        />
      ) : null}
      {part.state === 'output-error' ? (
        <ToolPartTextSection tone="error" title={t('chat.tool.error')} value={part.errorText} />
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
      <ToolPartValueSection title={t('chat.tool.arguments')} value={params ?? input} />
      {part.state === 'output-available' ? (
        <ToolPartTextSection
          title={t('chat.tool.response')}
          value={formatToolPartValue(part.output)}
        />
      ) : null}
      {part.state === 'output-error' ? (
        <ToolPartTextSection tone="error" title={t('chat.tool.error')} value={part.errorText} />
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
        <ToolPartTextSection title={t('chat.tool.code')} value={code} />
      ) : (
        <ToolPartValueSection title={t('chat.tool.arguments')} value={input} />
      )}
      {logs.length > 0 ? (
        <ToolPartTextSection title={t('chat.tool.logs')} value={logs.join('\n')} />
      ) : null}
      {typeof output?.error === 'string' ? (
        <ToolPartTextSection tone="error" title={t('chat.tool.error')} value={output.error} />
      ) : null}
      {output?.result !== undefined ? (
        <ToolPartTextSection
          title={t('chat.tool.result')}
          value={formatToolPartValue(output.result)}
        />
      ) : null}
      {part.state === 'output-available' && !output ? (
        <ToolPartTextSection
          title={t('chat.tool.response')}
          value={formatToolPartValue(part.output)}
        />
      ) : null}
      {part.state === 'output-error' ? (
        <ToolPartTextSection tone="error" title={t('chat.tool.error')} value={part.errorText} />
      ) : null}
    </>
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

function getToolName(part: ToolMessagePart) {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

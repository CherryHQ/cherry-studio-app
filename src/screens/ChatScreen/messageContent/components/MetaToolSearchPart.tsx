import { Accordion } from 'heroui-native/accordion';
import { WrenchIcon } from 'lucide-uniwind/png';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import type { CherryMessagePart } from '@/data/types/message';

type ToolMessagePart = Extract<CherryMessagePart, { type: 'dynamic-tool' | `tool-${string}` }>;

type MetaToolSearchPartProps = {
  part: ToolMessagePart;
};

type ToolSearchNamespace = {
  namespace: string;
  tools: Array<{ name: string }>;
};

const META_TOOL_SEARCH_NAME = 'tool_search';

export function MetaToolSearchPart({ part }: MetaToolSearchPartProps) {
  const { t } = useTranslation();
  const input = isRecord(part.input) ? part.input : undefined;
  const namespaces =
    part.state === 'output-available' ? parseToolSearchNamespaces(part.output) : [];
  const toolCount = namespaces.reduce((count, group) => count + group.tools.length, 0);
  const statusText = getMetaToolSearchStatusText(part, toolCount, t);
  const title = getMetaToolSearchTitle(input, part.title?.trim() || t('chat.metaToolSearch.title'));
  const isSearching = part.state === 'input-streaming' || part.state === 'input-available';

  return (
    <Accordion
      className="overflow-hidden rounded-lg border border-border bg-surface-secondary"
      hideSeparator
      isCollapsible
      selectionMode="single"
    >
      <Accordion.Item value="meta-tool-search">
        <Accordion.Trigger className="min-h-0 px-3 py-3">
          <MetaToolSearchHeaderContent
            isSearching={isSearching}
            statusText={statusText}
            title={title}
          />
          <Accordion.Indicator
            animation={{ rotation: { value: [-90, 0] } }}
            iconProps={{ size: 16 }}
          />
        </Accordion.Trigger>
        <Accordion.Content className="px-3 pt-0 pb-3">
          <View className="gap-2.5 border-border border-t pt-2">
            <ArgumentsBlock args={input} />
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
          </View>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion>
  );
}

function MetaToolSearchHeaderContent({
  isSearching,
  statusText,
  title,
}: {
  isSearching: boolean;
  statusText: string;
  title: string;
}) {
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-2">
      {isSearching ? (
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

function ArgumentsBlock({ args }: { args?: Record<string, unknown> }) {
  const entries = args ? Object.entries(args) : [];
  const { t } = useTranslation();

  if (entries.length === 0) return null;

  return (
    <View className="gap-1">
      <Text className="text-foreground-muted text-xs" selectable>
        {t('chat.metaToolSearch.arguments')}
      </Text>
      <View className="gap-1 rounded-md bg-surface-tertiary p-2">
        {entries.map(([key, value]) => (
          <View className="flex-row gap-2" key={key}>
            <Text className="w-20 shrink-0 font-mono text-foreground-muted text-xs" selectable>
              {key}
            </Text>
            <Text className="min-w-0 flex-1 font-mono text-default-foreground text-xs" selectable>
              {formatArgValue(value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function isMetaToolSearchPart(part: ToolMessagePart) {
  return getToolName(part) === META_TOOL_SEARCH_NAME;
}

function getMetaToolSearchTitle(args: Record<string, unknown> | undefined, fallback: string) {
  const query = typeof args?.query === 'string' ? args.query.trim() : '';
  const namespace = typeof args?.namespace === 'string' ? args.namespace.trim() : '';
  const parts = [query ? `"${query}"` : '', namespace ? `ns=${namespace}` : ''].filter(Boolean);
  return parts.length > 0 ? `${META_TOOL_SEARCH_NAME} - ${parts.join(' - ')}` : fallback;
}

function getMetaToolSearchStatusText(
  part: ToolMessagePart,
  toolCount: number,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (part.state === 'output-available') {
    return toolCount === 0
      ? t('chat.metaToolSearch.noResults')
      : t('chat.metaToolSearch.resultCount', { count: toolCount });
  }

  if (part.state === 'output-error') {
    return part.errorText;
  }

  if (part.state === 'output-denied') {
    return t('chat.metaToolSearch.denied');
  }

  if (part.state === 'approval-requested') {
    return t('chat.metaToolSearch.approvalRequested');
  }

  if (part.state === 'approval-responded') {
    return part.approval.approved
      ? t('chat.metaToolSearch.approved')
      : t('chat.metaToolSearch.denied');
  }

  return t('chat.metaToolSearch.searching');
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

function formatArgValue(value: unknown) {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getToolName(part: ToolMessagePart) {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

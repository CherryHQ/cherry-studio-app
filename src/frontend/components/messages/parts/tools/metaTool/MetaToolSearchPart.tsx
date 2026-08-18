import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { isRecord, type ToolMessagePart } from '../toolPartState';
import { MetaToolFrame } from './MetaToolFrame';
import { parseToolSearchNamespaces } from './metaToolState';

export function MetaToolSearchPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const input = isRecord(part.input) ? part.input : undefined;
  const namespaces =
    part.state === 'output-available' ? parseToolSearchNamespaces(part.output) : [];

  return (
    <MetaToolFrame part={part} toolName="tool_search">
      <MessagePart.ValueSection title={t('chat.tool.arguments')} value={input} />
      {part.state === 'output-available' && namespaces.length === 0 ? (
        <Text className="text-foreground text-base italic" selectable>
          {t('chat.metaToolSearch.noResults')}
        </Text>
      ) : null}
      {namespaces.map((group) => (
        <View className="gap-1.5" key={group.namespace}>
          <Text className="text-foreground text-base" selectable>
            {group.namespace} ({group.tools.length})
          </Text>
          <View className="flex-row flex-wrap gap-1">
            {group.tools.map((tool) => (
              <View className="max-w-full" key={`${group.namespace}-${tool.name}`}>
                <Text className="font-mono text-foreground text-base" numberOfLines={1} selectable>
                  {tool.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
      {part.state === 'output-error' ? (
        <MessagePart.TextSection
          tone="danger"
          title={t('chat.tool.error')}
          value={part.errorText}
        />
      ) : null}
    </MetaToolFrame>
  );
}

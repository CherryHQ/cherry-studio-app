import { Button, ContextMenuExclusion } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { chatHref } from '@/frontend/appShell/navigation/chat';
import { AgentMutationToolResultSchema } from '@/shared/data/types/agentManagementTool';

import { GenericToolPart } from './GenericToolPart';
import type { ToolMessagePart } from './toolPartState';

/** A saved definition is a useful result, not a JSON dump in the execution log. */
export function AgentManagementToolPart({ part }: { part: ToolMessagePart }) {
  const { t } = useTranslation();
  const router = useRouter();
  const result =
    part.state === 'output-available'
      ? AgentMutationToolResultSchema.safeParse(part.output)
      : undefined;
  if (!result?.success) return <GenericToolPart part={part} />;
  const { agent, status } = result.data;
  return (
    <ContextMenuExclusion className="min-h-11 max-w-full flex-row items-center gap-3 self-start rounded-full border border-border bg-secondary px-4 py-1">
      <View className="min-w-0 shrink flex-row items-center gap-2">
        <Text
          className="min-w-0 shrink font-medium text-base text-foreground"
          ellipsizeMode="tail"
          numberOfLines={1}
          selectable
        >
          {agent.name}
        </Text>
        <Text
          accessibilityElementsHidden
          className="text-muted-foreground text-xs"
          importantForAccessibility="no"
        >
          ·
        </Text>
        <Text className="min-w-0 shrink text-muted-foreground text-xs" numberOfLines={1}>
          {t(status === 'created' ? 'chat.agentTool.created' : 'chat.agentTool.updated')}
        </Text>
      </View>
      {agent.modelId ? (
        <Button
          accessibilityLabel={t('chat.agentTool.chatWithAgent', { name: agent.name })}
          hitSlop={10}
          onPress={() => router.push(chatHref({ kind: 'draft', agentId: agent.id }))}
          size="inline"
          variant="text"
        >
          <Button.Label numberOfLines={1}>{t('chat.agentTool.chat')}</Button.Label>
        </Button>
      ) : null}
    </ContextMenuExclusion>
  );
}

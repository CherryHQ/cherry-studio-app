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
    <ContextMenuExclusion>
      <View className="gap-3 rounded-2xl bg-card p-4">
        <Text className="text-muted-foreground text-sm">
          {t(status === 'created' ? 'chat.agentTool.created' : 'chat.agentTool.updated')}
        </Text>
        <Text className="font-semibold text-foreground text-lg" selectable>
          {agent.name}
        </Text>
        <Text className="text-muted-foreground text-sm">
          {agent.modelName ?? t('agent.model.none')}
        </Text>
        {agent.modelId ? (
          <Button onPress={() => router.push(chatHref({ kind: 'draft', agentId: agent.id }))}>
            {t('chat.agentTool.chat')}
          </Button>
        ) : null}
      </View>
    </ContextMenuExclusion>
  );
}

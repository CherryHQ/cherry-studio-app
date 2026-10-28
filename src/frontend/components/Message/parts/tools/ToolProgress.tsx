import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { MessageDetailText } from '@/frontend/components/MessageDetail';
import type { AgentToolProgress } from '@/shared/contracts/agent';

import { getBuiltInToolDisplay } from './builtInTool/builtInToolDisplay';

/** The tool calls a script made, in call order; arguments arrive as compact JSON cut for display. */
export function ToolProgress({ progress }: { progress: AgentToolProgress }) {
  const { t } = useTranslation();
  const labels = {
    pending: t('chat.tool.inputReady'),
    running: t('chat.tool.running'),
    ok: t('common.done'),
    error: t('chat.tool.callError'),
    interrupted: t('chat.tool.unfinished'),
  };
  return (
    <View className="gap-6">
      {progress.calls.map((call) => {
        const display = getBuiltInToolDisplay(call.name);
        return (
          <View key={call.id} className="gap-3">
            <View className="flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Text className="min-w-0 shrink font-medium text-foreground text-sm">
                {display ? t(display.titleKey) : (call.title ?? call.name)}
              </Text>
              <Text
                className={
                  call.status === 'error' ? 'text-error text-xs' : 'text-muted-foreground text-xs'
                }
              >
                {labels[call.status]}
              </Text>
            </View>
            <MessageDetailText
              language="json"
              title={t('chat.tool.arguments')}
              value={call.args}
              variant="code"
            />
          </View>
        );
      })}
    </View>
  );
}

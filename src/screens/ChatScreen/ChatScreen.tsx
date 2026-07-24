import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { MainHeader } from '@/components/headers';
import { loggerService } from '@/core/logger/LoggerService';
import { useMessages, useTopic } from '@/hooks/chat';

import { NewTopicScreen } from './NewTopicScreen';
import { ChatWorkspace } from './workspace';

// 诊断埋点：量化「点击 topic → 进入界面 → 渲染」链路耗时。`[PERF]` 前缀。
const perfLog = loggerService.withContext('ChatPerf');

export function ChatScreen() {
  const { topicId } = useLocalSearchParams<{ topicId?: string }>();
  const topic = useTopic(topicId);
  const messageWindow = useMessages(topicId, { enabled: Boolean(topicId) });
  const isTopicAvailable =
    topicId !== undefined && !topic.isError && (topic.isLoading || Boolean(topic.data));

  // ChatScreen 挂载 → topic/messages 两条 query 解析态每次变化取证，量化进入后的等待段。
  useEffect(() => {
    perfLog.debug('[PERF] ChatScreen state', {
      topicId,
      topicLoading: topic.isLoading,
      hasTopic: Boolean(topic.data),
      msgLoadingInitial: messageWindow.isLoadingInitial,
      msgCount: messageWindow.messages.length,
      isTopicAvailable,
      t: Date.now(),
    });
  }, [
    topicId,
    topic.isLoading,
    topic.data,
    messageWindow.isLoadingInitial,
    messageWindow.messages.length,
    isTopicAvailable,
  ]);

  return (
    <>
      <MainHeader />
      {isTopicAvailable ? (
        <View className="flex-1">
          <ChatWorkspace messageWindow={messageWindow} renderGateKey={topicId} topicId={topicId} />
        </View>
      ) : (
        <NewTopicScreen />
      )}
    </>
  );
}

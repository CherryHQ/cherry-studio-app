import { useComposerDockLayout } from '@cherrystudio/ui/components';
import { useIsPreview, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { MainHeader } from '@/frontend/components/headers';
import { useMessages, useTopic } from '@/frontend/hooks/chat';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { armLayoutBenchProbe, LAYOUT_BENCH_ASSISTANT_ID } from '@/shared/devBench/layoutBenchProbe';

import { ChatComposer, ChatEmptyState, ChatWorkspace } from './workspace';

// 诊断埋点：量化「点击 topic → 进入界面 → 渲染」链路耗时。`[PERF]` 前缀。
const perfLog = loggerService.withContext('ChatPerf');

// 预览态不挂输入框，列表底部只留一点视觉余量。
const PREVIEW_CONTENT_BOTTOM_INSET = 12;

/**
 * 一个屏：header + 中间那块 + 常驻输入框。
 *
 * 有话题时中间是会话，没有时是空状态文案——换的只有中间那块。输入框留在分支之外，因为它持有
 * 草稿与附件：跟着分支重挂会把用户正在写的东西、连同发送失败后的草稿回滚一起扔掉。
 */
export function ChatScreen() {
  const isPreview = useIsPreview();
  const { assistantId, topicId } = useLocalSearchParams<{
    assistantId?: string;
    topicId?: string;
  }>();
  const topic = useTopic(topicId);
  const messageWindow = useMessages(topicId, { enabled: Boolean(topicId) });
  const isTopicAvailable =
    topicId !== undefined && !topic.isError && (topic.isLoading || Boolean(topic.data));
  const composerDockLayout = useComposerDockLayout();
  const contentBottomInset = isPreview
    ? PREVIEW_CONTENT_BOTTOM_INSET
    : composerDockLayout.contentBottomInset;

  // layout-bench 的探针开关：只有 harness 会带着这个 assistantId 进来（日常开发一次都不会
  // 命中），而它比第一条消息早好几秒——假模型要到 streamText 才被构造，那时首轮的入场装填与
  // 开火已经发生过了，判据会对第一条消息完全失明。
  useEffect(() => {
    if (__DEV__ && assistantId === LAYOUT_BENCH_ASSISTANT_ID) {
      armLayoutBenchProbe();
    }
  }, [assistantId]);

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
      <View className="flex-1 bg-background-subtle">
        {isTopicAvailable ? (
          <ChatWorkspace
            bottomAccessoryHeight={isPreview ? undefined : composerDockLayout.inputHeightShared}
            contentBottomInset={contentBottomInset}
            keyboardOffset={isPreview ? 0 : composerDockLayout.keyboardOffset}
            messageWindow={messageWindow}
            renderGateKey={topicId}
            topicId={topicId}
          />
        ) : (
          <ChatEmptyState contentBottomInset={contentBottomInset} />
        )}
        {isPreview ? null : (
          <ChatComposer
            assistantId={assistantId}
            dismissKeyboardOnSend={false}
            onHeightChange={composerDockLayout.handleInputHeightChange}
            topicId={isTopicAvailable ? topicId : undefined}
          />
        )}
      </View>
    </>
  );
}

/**
 * 布局基准（layout bench）的 provider / 模型 / 助手种子数据。
 *
 * 基准需要一个「选中就能流式输出、且永远输出同样内容」的对话入口。这里种出的 provider 行
 * 不指向任何真实服务：它的 id 同时是运行时假 provider 的哨兵值（见
 * `@/backend/ai/devBench/installBenchMockProvider`），请求在到达网络层之前就被接管。
 *
 * baseUrl 仍填一个不可路由的占位地址——万一哪天假 provider 没装上，请求会立刻失败而不是
 * 打到某个真实端点上。
 */

import type { ModelCapability } from '@cherrystudio/provider-registry';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { DEFAULT_ASSISTANT_SETTINGS } from '@cherrystudio/universal/data/types/assistant';

import type { CreateProviderInput } from '@/backend/data/services/ProviderService';
import { LAYOUT_BENCH_ASSISTANT_ID } from '@/shared/devBench/layoutBenchProbe';

/** provider 行 id；`buildOpenAICompatibleConfig` 会把它原样写进 `providerSettings.name`。 */
export const LAYOUT_BENCH_PROVIDER_ID = 'layout-bench-mock';

export const layoutBenchModelId = 'layout-bench-model';

export const layoutBenchProvider: CreateProviderInput = {
  // 假 provider 不会真的用这把 key，但 provider 至少要有一把启用的 key 才符合「已配置」的
  // 常规形态，避免设置页把它显示成待配置状态。
  apiKeys: [{ id: 'layout-bench-key', isEnabled: true, key: 'layout-bench-no-network' }],
  defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
  endpointConfigs: {
    [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
      baseUrl: 'http://layout-bench.invalid',
    },
  },
  name: 'Layout Bench (mock)',
  providerId: LAYOUT_BENCH_PROVIDER_ID,
};

// 自定义模型行（无 presetModelId），`user_model_custom_config_check` 要求 name、capabilities、
// supportsStreaming 同时存在。
export const layoutBenchModel = {
  capabilities: [] as ModelCapability[],
  id: `${LAYOUT_BENCH_PROVIDER_ID}::${layoutBenchModelId}`,
  modelId: layoutBenchModelId,
  name: 'Layout Bench Model',
  orderKey: 'a0',
  providerId: LAYOUT_BENCH_PROVIDER_ID,
  supportsStreaming: true,
} as const;

export const layoutBenchAssistant = {
  description: '布局基准专用：发送 bench:<fixture> 回放确定性流式回复',
  emoji: '📐',
  // harness 的入口深链接按这个 id 进来，聊天屏也据它 arm 探针，所以 id 由探针模块持有。
  id: LAYOUT_BENCH_ASSISTANT_ID,
  modelId: layoutBenchModel.id,
  name: 'Layout Bench',
  orderKey: 'a0-bench',
  prompt: '',
  settings: DEFAULT_ASSISTANT_SETTINGS,
} as const;

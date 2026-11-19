import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// The testing agent's model, under Cherry Desktop's E2E variable names. The app itself talks to the
// local mock service. Without these, the runner reports MODEL_UNAVAILABLE when a test first asks
// for the agent.
export function agentModel() {
  const baseURL = process.env.CHERRY_TEST_CUSTOM_PROVIDER_BASE_URL;
  const model = process.env.CHERRY_TEST_CUSTOM_PROVIDER_CHAT_MODEL;
  const apiKey = process.env.CHERRY_TEST_CUSTOM_PROVIDER_API_KEY;
  if (!baseURL || !model || !apiKey) return undefined;
  const provider = createOpenAICompatible({
    name: 'acceptance-agent',
    baseURL: baseURL.replace(/\/$/, ''),
    apiKey,
    // DeepSeek's thinking mode rejects the required tool calls.
    transformRequestBody:
      new URL(baseURL).hostname === 'api.deepseek.com'
        ? (body) => ({ ...body, thinking: { type: 'disabled' } })
        : undefined,
  });
  return { model: provider.chatModel(model), apiKey };
}

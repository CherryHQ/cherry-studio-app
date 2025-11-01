import type { ImageRequireSource } from 'react-native'

import type { SystemProviderId } from '@/types/assistant'

const MODEL_ICONS_DARK = {
  chatgpt: require('@/assets/images/llmIcons/dark/openai.png'),
  o1: require('@/assets/images/llmIcons/dark/openai.png'),
  o3: require('@/assets/images/llmIcons/dark/openai.png'),
  gpt: require('@/assets/images/llmIcons/dark/openai.png'),
  claude: require('@/assets/images/llmIcons/dark/claude.png'),
  gemini: require('@/assets/images/llmIcons/dark/gemini.png'),
  grok: require('@/assets/images/llmIcons/dark/grok.png'),
  deepseek: require('@/assets/images/llmIcons/dark/deepseek.png'),
  doubao: require('@/assets/images/llmIcons/dark/doubao.png'),
  qwen: require('@/assets/images/llmIcons/dark/qwen.png'),
  moonshot: require('@/assets/images/llmIcons/dark/moonshot.png'),
  jina: require('@/assets/images/llmIcons/dark/jina.png'),

  voyage: require('@/assets/images/llmIcons/dark/voyage.png'),
  hunyuan: require('@/assets/images/llmIcons/dark/hunyuan.png'),
  llama: require('@/assets/images/llmIcons/dark/meta.png'),
  command: require('@/assets/images/llmIcons/dark/commanda.png'),
  mistral: require('@/assets/images/llmIcons/dark/mistral.png'),
  minimax: require('@/assets/images/llmIcons/dark/minimax.png'),
  yi: require('@/assets/images/llmIcons/dark/yi.png'),
  ai21: require('@/assets/images/llmIcons/dark/ai21.png'),
  baichuan: require('@/assets/images/llmIcons/dark/baichuan.png'),
  dbrx: require('@/assets/images/llmIcons/dark/dbrx.png'),
  gemma: require('@/assets/images/llmIcons/dark/gemma.png'),
  microsoft: require('@/assets/images/llmIcons/dark/microsoft.png'),
  nvidia: require('@/assets/images/llmIcons/dark/nvidia.png'),
  chatglm: require('@/assets/images/llmIcons/dark/chatglm.png'),
  upstage: require('@/assets/images/llmIcons/dark/upstage.png'),
  palmyra: require('@/assets/images/llmIcons/dark/palm.png'),
  step: require('@/assets/images/llmIcons/dark/stepfun.png'),
  glm: require('@/assets/images/llmIcons/dark/chatglm.png'),
  cohere: require('@/assets/images/llmIcons/dark/commanda.png'),
  phi: require('@/assets/images/llmIcons/dark/microsoft.png'),
  neversleeo: require('@/assets/images/llmIcons/dark/meta.png'),
  perplexity: require('@/assets/images/llmIcons/dark/perplexity.png'),
  sonar: require('@/assets/images/llmIcons/dark/perplexity.png'),
  stable: require('@/assets/images/llmIcons/dark/stability.png')
}

const MODEL_ICONS_LIGHT = {
  chatgpt: require('@/assets/images/llmIcons/light/openai.png'),
  o1: require('@/assets/images/llmIcons/light/openai.png'),
  o3: require('@/assets/images/llmIcons/light/openai.png'),
  gpt: require('@/assets/images/llmIcons/light/openai.png'),
  claude: require('@/assets/images/llmIcons/light/claude.png'),
  gemini: require('@/assets/images/llmIcons/light/gemini.png'),
  grok: require('@/assets/images/llmIcons/light/grok.png'),
  deepseek: require('@/assets/images/llmIcons/light/deepseek.png'),
  doubao: require('@/assets/images/llmIcons/light/doubao.png'),
  qwen: require('@/assets/images/llmIcons/light/qwen.png'),
  moonshot: require('@/assets/images/llmIcons/light/moonshot.png'),
  jina: require('@/assets/images/llmIcons/light/jina.png'),

  voyage: require('@/assets/images/llmIcons/light/voyage.png'),
  hunyuan: require('@/assets/images/llmIcons/light/hunyuan.png'),
  llama: require('@/assets/images/llmIcons/light/meta.png'),
  command: require('@/assets/images/llmIcons/light/commanda.png'),
  mistral: require('@/assets/images/llmIcons/light/mistral.png'),
  minimax: require('@/assets/images/llmIcons/light/minimax.png'),
  yi: require('@/assets/images/llmIcons/light/yi.png'),
  ai21: require('@/assets/images/llmIcons/light/ai21.png'),
  baichuan: require('@/assets/images/llmIcons/light/baichuan.png'),
  dbrx: require('@/assets/images/llmIcons/light/dbrx.png'),
  gemma: require('@/assets/images/llmIcons/light/gemma.png'),
  microsoft: require('@/assets/images/llmIcons/light/microsoft.png'),
  nvidia: require('@/assets/images/llmIcons/light/nvidia.png'),
  chatglm: require('@/assets/images/llmIcons/light/chatglm.png'),
  upstage: require('@/assets/images/llmIcons/light/upstage.png'),
  palmyra: require('@/assets/images/llmIcons/light/palm.png'),
  step: require('@/assets/images/llmIcons/light/stepfun.png'),
  glm: require('@/assets/images/llmIcons/light/chatglm.png'),
  cohere: require('@/assets/images/llmIcons/light/commanda.png'),
  phi: require('@/assets/images/llmIcons/light/microsoft.png'),
  neversleeo: require('@/assets/images/llmIcons/light/meta.png'),
  perplexity: require('@/assets/images/llmIcons/light/perplexity.png'),
  sonar: require('@/assets/images/llmIcons/light/perplexity.png'),
  stable: require('@/assets/images/llmIcons/light/stability.png')
}

export function getModelIcon(modelId: string, isDark: boolean): ImageRequireSource | undefined {
  const modelIcons = isDark ? MODEL_ICONS_DARK : MODEL_ICONS_LIGHT
  let result = undefined

  for (const key in modelIcons) {
    const regex = new RegExp(key, 'i')

    if (regex.test(modelId)) {
      result = modelIcons[key as keyof typeof modelIcons]
      break
    }
  }

  return result
}

const PROVIDER_ICONS_DARK: Record<SystemProviderId | 'default', ImageRequireSource> = {
  gemini: require('@/assets/images/llmIcons/dark/google.png'),
  grok: require('@/assets/images/llmIcons/dark/grok.png'),
  deepseek: require('@/assets/images/llmIcons/dark/deepseek.png'),
  doubao: require('@/assets/images/llmIcons/dark/doubao.png'),
  moonshot: require('@/assets/images/llmIcons/dark/moonshot.png'),
  jina: require('@/assets/images/llmIcons/dark/jina.png'),
  hunyuan: require('@/assets/images/llmIcons/dark/hunyuan.png'),
  mistral: require('@/assets/images/llmIcons/dark/mistral.png'),
  minimax: require('@/assets/images/llmIcons/dark/minimax.png'),
  yi: require('@/assets/images/llmIcons/dark/yi.png'),
  baichuan: require('@/assets/images/llmIcons/dark/baichuan.png'),
  nvidia: require('@/assets/images/llmIcons/dark/nvidia.png'),
  perplexity: require('@/assets/images/llmIcons/dark/perplexity.png'),
  cherryin: require('@/assets/images/llmIcons/dark/cherryIn.png'),
  silicon: require('@/assets/images/llmIcons/dark/silicon.png'),
  aihubmix: require('@/assets/images/llmIcons/dark/aihubmix.png'),
  ocoolai: require('@/assets/images/llmIcons/dark/ocoolai.png'),
  ppio: require('@/assets/images/llmIcons/dark/ppio.png'),
  alayanew: require('@/assets/images/llmIcons/dark/alayanew.png'),
  qiniu: require('@/assets/images/llmIcons/dark/qiniu.png'),
  dmxapi: require('@/assets/images/llmIcons/dark/dmxapi.png'),
  burncloud: require('@/assets/images/llmIcons/dark/burncloud.png'),
  tokenflux: require('@/assets/images/llmIcons/dark/tokenflux.png'),
  '302ai': require('@/assets/images/llmIcons/dark/302ai.png'),
  cephalon: require('@/assets/images/llmIcons/dark/cephalon.png'),
  lanyun: require('@/assets/images/llmIcons/dark/lanyun.png'),
  ph8: require('@/assets/images/llmIcons/dark/ph8.png'),
  openrouter: require('@/assets/images/llmIcons/dark/openrouter.png'),
  ollama: require('@/assets/images/llmIcons/dark/ollama.png'),
  'new-api': require('@/assets/images/llmIcons/dark/newapi.png'),
  lmstudio: require('@/assets/images/llmIcons/dark/lmstudio.png'),
  anthropic: require('@/assets/images/llmIcons/dark/anthropic.png'),
  openai: require('@/assets/images/llmIcons/dark/openai.png'),
  'azure-openai': require('@/assets/images/llmIcons/dark/azure.png'),
  github: require('@/assets/images/llmIcons/dark/github.png'),
  copilot: require('@/assets/images/llmIcons/dark/githubcopilot.png'),
  zhipu: require('@/assets/images/llmIcons/dark/zhipu.png'),
  dashscope: require('@/assets/images/llmIcons/dark/dashscope.png'),
  stepfun: require('@/assets/images/llmIcons/dark/stepfun.png'),
  infini: require('@/assets/images/llmIcons/dark/infini.png'),
  groq: require('@/assets/images/llmIcons/dark/groq.png'),
  together: require('@/assets/images/llmIcons/dark/together.png'),
  fireworks: require('@/assets/images/llmIcons/dark/fireworks.png'),
  hyperbolic: require('@/assets/images/llmIcons/dark/hyperbolic.png'),
  modelscope: require('@/assets/images/llmIcons/dark/modelscope.png'),
  xirang: require('@/assets/images/llmIcons/dark/xirang.png'),
  'tencent-cloud-ti': require('@/assets/images/llmIcons/dark/hunyuan.png'),
  'baidu-cloud': require('@/assets/images/llmIcons/dark/baidu.png'),
  gpustack: require('@/assets/images/llmIcons/dark/gpustack.png'),
  voyageai: require('@/assets/images/llmIcons/dark/voyage.png'),
  'aws-bedrock': require('@/assets/images/llmIcons/dark/bedrock.png'),
  poe: require('@/assets/images/llmIcons/dark/poe.png'),
  default: require('@/assets/images/llmIcons/dark/openai.png')
}

const PROVIDER_ICONS_LIGHT: Record<SystemProviderId | 'default', ImageRequireSource> = {
  gemini: require('@/assets/images/llmIcons/light/google.png'),
  grok: require('@/assets/images/llmIcons/light/grok.png'),
  deepseek: require('@/assets/images/llmIcons/light/deepseek.png'),
  doubao: require('@/assets/images/llmIcons/light/doubao.png'),
  moonshot: require('@/assets/images/llmIcons/light/moonshot.png'),
  jina: require('@/assets/images/llmIcons/light/jina.png'),
  hunyuan: require('@/assets/images/llmIcons/light/hunyuan.png'),
  mistral: require('@/assets/images/llmIcons/light/mistral.png'),
  minimax: require('@/assets/images/llmIcons/light/minimax.png'),
  yi: require('@/assets/images/llmIcons/light/yi.png'),
  baichuan: require('@/assets/images/llmIcons/light/baichuan.png'),
  nvidia: require('@/assets/images/llmIcons/light/nvidia.png'),
  perplexity: require('@/assets/images/llmIcons/light/perplexity.png'),
  cherryin: require('@/assets/images/llmIcons/light/cherryIn.png'),
  silicon: require('@/assets/images/llmIcons/light/silicon.png'),
  aihubmix: require('@/assets/images/llmIcons/light/aihubmix.png'),
  ocoolai: require('@/assets/images/llmIcons/light/ocoolai.png'),
  ppio: require('@/assets/images/llmIcons/light/ppio.png'),
  alayanew: require('@/assets/images/llmIcons/light/alayanew.png'),
  qiniu: require('@/assets/images/llmIcons/light/qiniu.png'),
  dmxapi: require('@/assets/images/llmIcons/light/dmxapi.png'),
  burncloud: require('@/assets/images/llmIcons/light/burncloud.png'),
  tokenflux: require('@/assets/images/llmIcons/light/tokenflux.png'),
  '302ai': require('@/assets/images/llmIcons/light/302ai.png'),
  cephalon: require('@/assets/images/llmIcons/light/cephalon.png'),
  lanyun: require('@/assets/images/llmIcons/light/lanyun.png'),
  ph8: require('@/assets/images/llmIcons/light/ph8.png'),
  openrouter: require('@/assets/images/llmIcons/light/openrouter.png'),
  ollama: require('@/assets/images/llmIcons/light/ollama.png'),
  'new-api': require('@/assets/images/llmIcons/light/newapi.png'),
  lmstudio: require('@/assets/images/llmIcons/light/lmstudio.png'),
  anthropic: require('@/assets/images/llmIcons/light/anthropic.png'),
  openai: require('@/assets/images/llmIcons/light/openai.png'),
  'azure-openai': require('@/assets/images/llmIcons/light/azure.png'),
  github: require('@/assets/images/llmIcons/light/github.png'),
  copilot: require('@/assets/images/llmIcons/light/githubcopilot.png'),
  zhipu: require('@/assets/images/llmIcons/light/zhipu.png'),
  dashscope: require('@/assets/images/llmIcons/light/dashscope.png'),
  stepfun: require('@/assets/images/llmIcons/light/stepfun.png'),
  infini: require('@/assets/images/llmIcons/light/infini.png'),
  groq: require('@/assets/images/llmIcons/light/groq.png'),
  together: require('@/assets/images/llmIcons/light/together.png'),
  fireworks: require('@/assets/images/llmIcons/light/fireworks.png'),
  hyperbolic: require('@/assets/images/llmIcons/light/hyperbolic.png'),
  modelscope: require('@/assets/images/llmIcons/light/modelscope.png'),
  xirang: require('@/assets/images/llmIcons/light/xirang.png'),
  'tencent-cloud-ti': require('@/assets/images/llmIcons/light/hunyuan.png'),
  'baidu-cloud': require('@/assets/images/llmIcons/light/baidu.png'),
  gpustack: require('@/assets/images/llmIcons/light/gpustack.png'),
  voyageai: require('@/assets/images/llmIcons/light/voyage.png'),
  'aws-bedrock': require('@/assets/images/llmIcons/light/bedrock.png'),
  poe: require('@/assets/images/llmIcons/light/poe.png'),
  default: require('@/assets/images/llmIcons/light/openai.png')
}

export function getProviderIcon(providerId: string, isDark: boolean): ImageRequireSource {
  const providerIcons = isDark ? PROVIDER_ICONS_DARK : PROVIDER_ICONS_LIGHT
  return providerIcons[providerId as SystemProviderId] || providerIcons.default
}

export function getModelOrProviderIcon(modelId: string, providerId: string, isDark: boolean): ImageRequireSource {
  // 先尝试获取模型图标
  const modelIcon = getModelIcon(modelId, isDark)

  if (modelIcon) {
    return modelIcon
  }

  // 如果没有模型图标，则使用提供商图标
  return getProviderIcon(providerId, isDark)
}

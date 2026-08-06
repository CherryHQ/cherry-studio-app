import type { AgentMessage,AgentTool } from '@earendil-works/pi-agent-core'
import { Agent } from '@earendil-works/pi-agent-core'

import type { Model as CherryModel, Provider as CherryProvider } from '@/types/assistant'

import { createStreamFn } from './streamBridge'

const DEFAULT_SYSTEM_PROMPT = [
  'You are a helpful personal assistant agent running on the user\'s phone.',
  'You can use the provided tools to read and control device capabilities such as reminders, calendar, shortcuts, and fetching web content.',
  'Plan multi-step tasks, call tools when needed, and summarize results for the user.'
].join('\n')

/**
 * 封装 pi-agent-core 的 Agent，绑定到 Cherry 的模型与 provider。
 *
 * - 生命周期：prompt / continue / abort / reset
 * - 事件：subscribe（message_update / tool_execution_* 等，供 UI 渲染）
 * - 工具：可动态替换（setTools）
 */
export class AgentService {
  private agent: Agent

  constructor(model: CherryModel, provider: CherryProvider, tools: AgentTool[], systemPrompt?: string) {
    this.agent = new Agent({
      initialState: {
        systemPrompt: systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        // pi-agent-core 需要其 Model 元数据对象；streamFn 实际使用
        // Cherry 的 provider 配置发起请求，这里只承载标识信息。
        model: {
          id: model.id,
          api: provider.apiHost ?? 'custom',
          provider: provider.id,
          name: model.name
        } as never,
        tools
      },
      streamFn: createStreamFn(model, provider)
    })
  }

  subscribe(callback: (event: Parameters<Parameters<Agent['subscribe']>[0]>[0]) => void) {
    return this.agent.subscribe(callback)
  }

  async prompt(text: string) {
    await this.agent.prompt(text)
  }

  async continue() {
    await this.agent.continue()
  }

  abort() {
    this.agent.abort()
  }

  reset() {
    this.agent.reset()
  }

  setTools(tools: AgentTool[]) {
    this.agent.state.tools = tools
  }

  get messages(): AgentMessage[] {
    return this.agent.state.messages
  }

  get isStreaming(): boolean {
    return this.agent.state.isStreaming
  }
}

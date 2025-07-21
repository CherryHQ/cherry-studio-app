// /**
//  * 工具调用 Chunk 处理模块
//  *
//  * 提供工具调用相关的处理API，每个交互使用一个新的实例
//  */

import { ToolCallUnion, ToolResultUnion, ToolSet } from '@cherrystudio/ai-core'

import { loggerService } from '@/services/LoggerService'
import { Chunk, ChunkType } from '@/types/chunk'
import { MCPToolResponse } from '@/types/mcp'
import { BaseTool } from '@/types/tool'

// import { Chunk, ChunkType } from '@/types/chunk'
// import { MCPToolResponse } from '@/types/mcp'

const logger = loggerService.withContext('ToolCallChunkHandler')
/**
 * 工具调用处理器类
 */
export class ToolCallChunkHandler {
  //   private onChunk: (chunk: Chunk) => void
  private activeToolCalls = new Map<
    string,
    {
      toolCallId: string
      toolName: string
      args: any
      // mcpTool 现在可以是 MCPTool 或我们为 Provider 工具创建的通用类型
      tool: BaseTool
    }
  >()
  constructor(
    private onChunk: (chunk: Chunk) => void,
    private mcpTools: BaseTool[]
  ) {}

  //   /**
  //    * 设置 onChunk 回调
  //    */
  //   public setOnChunk(callback: (chunk: Chunk) => void): void {
  //     this.onChunk = callback
  //   }

  handleToolCallCreated(chunk: { type: 'tool-input-start' | 'tool-input-delta' | 'tool-input-end' }): void {
    switch (chunk.type) {
      case 'tool-input-start': {
        // 能拿到说明是mcpTool
        if (this.activeToolCalls.get(chunk.id)) return

        const tool: BaseTool = {
          id: chunk.id,
          name: chunk.toolName,
          description: chunk.toolName,
          type: chunk.toolName.startsWith('builtin_') ? 'builtin' : 'provider'
        }
        this.activeToolCalls.set(chunk.id, {
          toolCallId: chunk.id,
          toolName: chunk.toolName,
          args: '',
          tool
        })
        break
      }

      case 'tool-input-delta': {
        const toolCall = this.activeToolCalls.get(chunk.id)

        if (!toolCall) {
          logger.warn(`🔧 [ToolCallChunkHandler] Tool call not found: ${chunk.id}`)
          return
        }

        toolCall.args += chunk.delta
        break
      }

      case 'tool-input-end': {
        const toolCall = this.activeToolCalls.get(chunk.id)
        this.activeToolCalls.delete(chunk.id)

        if (!toolCall) {
          logger.warn(`🔧 [ToolCallChunkHandler] Tool call not found: ${chunk.id}`)
          return
        }

        const toolResponse: ToolCallResponse = {
          id: toolCall.toolCallId,
          tool: toolCall.tool,
          arguments: toolCall.args,
          status: 'pending',
          toolCallId: toolCall.toolCallId
        }
        console.log('toolResponse', toolResponse)
        this.onChunk({
          type: ChunkType.MCP_TOOL_PENDING,
          responses: [toolResponse]
        })
        break
      }
    }
    // if (!toolCall) {
    //   logger.warn(`🔧 [ToolCallChunkHandler] Tool call not found: ${chunk.id}`)
    //   return
    // }
    // this.onChunk({
    //   type: ChunkType.MCP_TOOL_CREATED,
    //   tool_calls: [
    //     {
    //       id: chunk.id,
    //       name: chunk.toolName,
    //       status: 'pending'
    //     }
    //   ]
    // })
  }

  /**
   * 处理工具调用事件
   */
  public handleToolCall(
    chunk: {
      type: 'tool-call'
    } & ToolCallUnion<ToolSet>
  ): void {
    const { toolCallId, toolName, input: args, providerExecuted } = chunk

    if (!toolCallId || !toolName) {
      logger.warn(`🔧 [ToolCallChunkHandler] Invalid tool call chunk: missing toolCallId or toolName`)
      return
    }

    let tool: BaseTool

    // 根据 providerExecuted 标志区分处理逻辑
    if (providerExecuted) {
      // 如果是 Provider 执行的工具（如 web_search）
      logger.info(`[ToolCallChunkHandler] Handling provider-executed tool: ${toolName}`)
      tool = {
        id: toolCallId,
        name: toolName,
        description: toolName,
        type: 'provider'
      }
    } else if (toolName.startsWith('builtin_')) {
      // 如果是内置工具，沿用现有逻辑
      logger.info(`[ToolCallChunkHandler] Handling builtin tool: ${toolName}`)
      tool = {
        id: toolCallId,
        name: toolName,
        description: toolName,
        type: 'builtin'
      }
    } else {
      // 如果是客户端执行的 MCP 工具，沿用现有逻辑
      logger.info(`[ToolCallChunkHandler] Handling client-side MCP tool: ${toolName}`)
      const mcpTool = this.mcpTools.find(t => t.name === toolName)

      if (!mcpTool) {
        logger.warn(`[ToolCallChunkHandler] MCP tool not found: ${toolName}`)
        return
      }

      tool = mcpTool
    }

    // 记录活跃的工具调用
    this.activeToolCalls.set(toolCallId, {
      toolCallId,
      toolName,
      args,
      tool
    })

    // 创建 MCPToolResponse 格式
    const toolResponse: MCPToolResponse = {
      id: toolCallId,
      tool: tool,
      arguments: args,
      status: 'invoking',
      toolCallId: toolCallId
    }

    // 调用 onChunk
    if (this.onChunk) {
      this.onChunk({
        type: ChunkType.MCP_TOOL_IN_PROGRESS,
        responses: [toolResponse]
      })
    }
  }

  /**
   * 处理工具调用结果事件
   */
  public handleToolResult(
    chunk: {
      type: 'tool-result'
    } & ToolResultUnion<ToolSet>
  ): void {
    const { toolCallId, output, input } = chunk

    if (!toolCallId) {
      logger.warn(`🔧 [ToolCallChunkHandler] Invalid tool result chunk: missing toolCallId`)
      return
    }

    // 查找对应的工具调用信息
    const toolCallInfo = this.activeToolCalls.get(toolCallId)

    if (!toolCallInfo) {
      logger.warn(`🔧 [ToolCallChunkHandler] Tool call info not found for ID: ${toolCallId}`)
      return
    }

    // 创建工具调用结果的 MCPToolResponse 格式
    const toolResponse: MCPToolResponse = {
      id: toolCallId,
      tool: toolCallInfo.tool,
      arguments: input,
      status: 'done',
      response: {
        data: output,
        success: true
      },
      toolCallId: toolCallId
    }
    // 从活跃调用中移除（交互结束后整个实例会被丢弃）
    this.activeToolCalls.delete(toolCallId)

    // 调用 onChunk
    if (this.onChunk) {
      this.onChunk({
        type: ChunkType.MCP_TOOL_COMPLETE,
        responses: [toolResponse]
      })
    }
  }
}

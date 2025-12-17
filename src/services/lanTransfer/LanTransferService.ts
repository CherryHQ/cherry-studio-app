import { Buffer } from 'buffer'
import { File } from 'expo-file-system'
import TcpSocket from 'react-native-tcp-socket'

import { LAN_TRANSFER_GLOBAL_TIMEOUT_MS, LAN_TRANSFER_MESSAGE_TERMINATOR } from '@/constants/lanTransfer'
import { loggerService } from '@/services/LoggerService'
import type {
  FileTransferProgress,
  LanTransferFileCompleteErrorCode,
  LanTransferOutgoingMessage,
  LanTransferState
} from '@/types/lanTransfer'
import { FileTransferStatus, LanTransferServerStatus } from '@/types/lanTransfer'

import { parseNextMessage } from './binaryParser'
import {
  handleBinaryFileChunk,
  handleFileCancel,
  handleFileChunk,
  handleFileEnd,
  handleFileStart,
  handleHandshake,
  handlePing
} from './handlers'
import type { InternalFileTransfer, TcpClientSocket, TcpServer } from './types'
import {
  isValidFileCancelMessage,
  isValidFileChunkMessage,
  isValidFileEndMessage,
  isValidFileStartMessage,
  isValidHandshakeMessage,
  isValidPingMessage
} from './validators'

const logger = loggerService.withContext('LanTransferService')

// State update throttle interval (ms) - 250ms to reduce JS thread saturation
const STATE_UPDATE_THROTTLE_MS = 250

class LanTransferService {
  private server: TcpServer = null
  private clientSocket: TcpClientSocket = null
  private binaryBuffer = Buffer.alloc(0)
  private listeners = new Set<() => void>()

  private currentTransfer: InternalFileTransfer | null = null
  private globalTimeoutId: ReturnType<typeof setTimeout> | null = null

  // State update throttling
  private lastStateUpdateTime = 0
  private pendingStateUpdate: Partial<LanTransferState> | null = null
  private stateUpdateTimeoutId: ReturnType<typeof setTimeout> | null = null

  private state: LanTransferState = {
    status: LanTransferServerStatus.IDLE
  }

  // Cached snapshot for useSyncExternalStore
  private cachedSnapshot: LanTransferState = {
    status: LanTransferServerStatus.IDLE
  }

  // ==================== Public API ====================

  startServer = () => {
    if (this.server) return

    this.updateState({ status: LanTransferServerStatus.STARTING, lastError: undefined })

    try {
      this.server = TcpSocket.createServer(this.handleIncomingConnection)
      this.server.on('error', this.handleServerError)
      this.server.on('close', () => {
        this.server = null
        const preserveErrorState = this.state.status === LanTransferServerStatus.ERROR
        this.cleanupClient(false, preserveErrorState ? LanTransferServerStatus.ERROR : LanTransferServerStatus.IDLE)
      })

      this.server.listen({ port: 0, host: '0.0.0.0', reuseAddress: true }, () => {
        const address = this.server?.address()
        const actualPort = typeof address === 'object' && address?.port ? address.port : 0
        logger.info(`TCP server listening on port ${actualPort}`)
        this.updateState({
          status: LanTransferServerStatus.LISTENING,
          port: actualPort
        })
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error while starting server'
      logger.error('Failed to start TCP server', error)
      this.shutdownServer(LanTransferServerStatus.ERROR, message)
    }
  }

  stopServer = () => {
    if (!this.server && !this.clientSocket) {
      return
    }
    this.shutdownServer(LanTransferServerStatus.IDLE, undefined, true)
  }

  subscribe = (callback: () => void) => {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  getState = () => this.getSnapshot()

  clearCompletedFile = () => {
    this.updateState({ completedFilePath: undefined })
  }

  clearTransferCancelled = () => {
    this.updateState({ transferCancelled: undefined })
  }

  cancelCurrentTransfer = () => {
    logger.info('cancelCurrentTransfer called', { hasCurrentTransfer: !!this.currentTransfer })

    // 立即暂停并销毁 socket，彻底停止所有数据接收
    // 关键：必须立即 destroy，否则 native 层已缓冲的数据会继续发送到 JS 线程
    if (this.clientSocket) {
      this.removeSocketDataListener()
      try {
        this.clientSocket.destroy()
      } catch (e) {
        logger.warn('Failed to destroy socket', e)
      }
      this.clientSocket = null
    }

    this.binaryBuffer = Buffer.alloc(0)

    if (!this.currentTransfer) {
      // 即使没有 currentTransfer，也清理状态（处理状态不同步的情况）
      logger.warn('cancelCurrentTransfer: no current transfer, cleaning up state')
      this.updateState({
        status: LanTransferServerStatus.LISTENING,
        connectedClient: undefined,
        fileTransfer: undefined,
        transferCancelled: true
      })
      return
    }

    // 先设置 CANCELLING 状态，让 UI 显示 loading
    this.currentTransfer.status = FileTransferStatus.CANCELLING

    // 立即清理内存缓冲区，防止内存增长
    this.currentTransfer.pendingChunks.clear()
    this.currentTransfer.pendingBytesSize = 0
    this.currentTransfer.flushScheduled = false

    this.updateState({ fileTransfer: this.getTransferProgress() })

    // 立即执行取消逻辑（socket 已销毁，不会有延迟）
    this.completeTransfer(false, 'Transfer cancelled by user', undefined, undefined, 'CANCELLED')
  }

  // ==================== Connection Handling ====================

  private removeSocketDataListener = () => {
    if (this.clientSocket) {
      this.clientSocket.removeListener('data', this.handleSocketData)
    }
  }

  private handleIncomingConnection = (socket: NonNullable<TcpClientSocket>) => {
    if (this.clientSocket) {
      this.clientSocket.destroy()
    }

    // Clean up any existing transfer state before accepting new connection
    if (this.currentTransfer) {
      this.cleanupTransfer()
    }

    this.clientSocket = socket
    this.binaryBuffer = Buffer.alloc(0)

    this.updateState({ status: LanTransferServerStatus.HANDSHAKING, connectedClient: undefined })

    socket.on('data', this.handleSocketData)
    socket.on('error', error => {
      logger.error('Socket error', error)
      this.cleanupClient()
    })
    socket.on('close', () => {
      this.cleanupClient()
    })
  }

  // ==================== Message Parsing ====================

  private handleSocketData = (chunk: Buffer | string) => {
    // 如果正在取消，快速跳过已排队的数据事件（避免 3-5 秒的处理延迟）
    if (
      this.currentTransfer?.status === FileTransferStatus.CANCELLING ||
      this.currentTransfer?.status === FileTransferStatus.CANCELLED
    ) {
      return
    }

    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')
    this.binaryBuffer = Buffer.concat([this.binaryBuffer, incoming])

    while (this.binaryBuffer.length > 0) {
      const result = parseNextMessage(this.binaryBuffer)

      if (result.type === 'incomplete') {
        break
      }

      // Consume processed bytes
      this.binaryBuffer = this.binaryBuffer.subarray(result.consumedBytes)

      if (result.type === 'binary_chunk' && result.chunk) {
        this.handleBinaryChunk(result.chunk.transferId, result.chunk.chunkIndex, result.chunk.data)
      } else if (result.type === 'json' && result.json) {
        this.handleJsonMessage(result.json)
      }
      // 'skip' type: just continue loop (bytes already consumed)
    }
  }

  private handleJsonMessage = (rawMessage: string) => {
    let parsed: unknown = null

    try {
      parsed = JSON.parse(rawMessage)
    } catch (error) {
      logger.error('Malformed LAN transfer message', error, {
        rawMessage,
        length: rawMessage.length
      })
      return
    }

    if (!parsed || typeof parsed !== 'object') {
      return
    }

    const msgType = (parsed as { type?: unknown }).type

    switch (msgType) {
      case 'handshake':
        if (isValidHandshakeMessage(parsed)) {
          handleHandshake(parsed, {
            sendJsonMessage: this.sendJsonMessage,
            updateState: this.updateState,
            cleanupClient: () => this.cleanupClient()
          })
        }
        break
      case 'ping':
        if (isValidPingMessage(parsed)) {
          handlePing(parsed, {
            sendJsonMessage: this.sendJsonMessage,
            getStatus: () => this.state.status
          })
        }
        break
      case 'file_start':
        if (isValidFileStartMessage(parsed)) {
          handleFileStart(parsed, this.createFileTransferContext())
        }
        break
      case 'file_chunk':
        if (isValidFileChunkMessage(parsed)) {
          handleFileChunk(parsed, this.createFileTransferContext())
        }
        break
      case 'file_end':
        if (isValidFileEndMessage(parsed)) {
          handleFileEnd(parsed, this.createFileTransferContext())
        }
        break
      case 'file_cancel':
        if (isValidFileCancelMessage(parsed)) {
          handleFileCancel(parsed, this.createFileTransferContext())
        }
        break
      default:
        break
    }
  }

  private handleBinaryChunk = (transferId: string, chunkIndex: number, data: Buffer) => {
    handleBinaryFileChunk(transferId, chunkIndex, data, this.createFileTransferContext())
  }

  // ==================== File Transfer Context ====================

  private createFileTransferContext = () => ({
    sendJsonMessage: this.sendJsonMessage,
    updateState: this.updateState,
    getStatus: () => this.state.status,
    getCurrentTransfer: () => this.currentTransfer,
    setCurrentTransfer: (transfer: InternalFileTransfer | null) => {
      this.currentTransfer = transfer
    },
    getTransferProgress: this.getTransferProgress,
    cleanupTransfer: this.cleanupTransfer,
    completeTransfer: this.completeTransfer,
    startGlobalTimeout: this.startGlobalTimeout,
    onProgressUpdate: this.onProgressUpdate
  })

  // ==================== Transfer Progress ====================

  private getTransferProgress = (): FileTransferProgress | undefined => {
    if (!this.currentTransfer) return undefined

    const elapsed = Date.now() - this.currentTransfer.startTime
    const bytesPerMs = this.currentTransfer.bytesReceived / elapsed
    const remainingBytes = this.currentTransfer.fileSize - this.currentTransfer.bytesReceived

    return {
      transferId: this.currentTransfer.transferId,
      fileName: this.currentTransfer.fileName,
      fileSize: this.currentTransfer.fileSize,
      bytesReceived: this.currentTransfer.bytesReceived,
      percentage: Math.round((this.currentTransfer.bytesReceived / this.currentTransfer.fileSize) * 100),
      chunksReceived: this.currentTransfer.receivedChunks.size,
      totalChunks: this.currentTransfer.totalChunks,
      status: this.currentTransfer.status,
      startTime: this.currentTransfer.startTime,
      elapsedMs: elapsed,
      estimatedRemainingMs: bytesPerMs > 0 ? Math.round(remainingBytes / bytesPerMs) : undefined
    }
  }

  // Throttled progress update callback
  private onProgressUpdate = () => {
    const now = Date.now()
    const timeSinceLastUpdate = now - this.lastStateUpdateTime

    if (timeSinceLastUpdate >= STATE_UPDATE_THROTTLE_MS) {
      // Enough time has passed, update immediately
      this.updateState({ fileTransfer: this.getTransferProgress() })
    } else if (!this.stateUpdateTimeoutId) {
      // Schedule a delayed update
      this.stateUpdateTimeoutId = setTimeout(() => {
        this.stateUpdateTimeoutId = null
        this.updateState({ fileTransfer: this.getTransferProgress() })
      }, STATE_UPDATE_THROTTLE_MS - timeSinceLastUpdate)
    }
  }

  // ==================== Transfer Completion ====================

  private completeTransfer = (
    success: boolean,
    error?: string,
    filePath?: string,
    failedTargetPath?: string,
    errorCode?: LanTransferFileCompleteErrorCode
  ) => {
    if (!this.currentTransfer) return

    if (success) {
      this.currentTransfer.status = FileTransferStatus.COMPLETE
    } else if (errorCode === 'CANCELLED') {
      this.currentTransfer.status = FileTransferStatus.CANCELLED
    } else {
      this.currentTransfer.status = FileTransferStatus.ERROR
    }

    // Send enhanced file_complete message
    this.sendJsonMessage({
      type: 'file_complete',
      transferId: this.currentTransfer.transferId,
      success,
      filePath,
      error,
      errorCode,
      receivedChunks: this.currentTransfer.receivedChunks.size,
      receivedBytes: this.currentTransfer.bytesReceived
    })

    this.updateState({
      status: LanTransferServerStatus.LISTENING,
      connectedClient: undefined,
      fileTransfer: success || errorCode === 'CANCELLED' ? undefined : { ...this.getTransferProgress()!, error },
      completedFilePath: success ? filePath : undefined,
      transferCancelled: errorCode === 'CANCELLED' ? true : this.state.transferCancelled
    })

    this.cleanupTransfer(failedTargetPath)
  }

  // ==================== Cleanup ====================

  private cleanupTransfer = (targetFilePath?: string) => {
    this.clearGlobalTimeout()

    // Cancel any pending state update
    if (this.stateUpdateTimeoutId) {
      clearTimeout(this.stateUpdateTimeoutId)
      this.stateUpdateTimeoutId = null
    }

    const transferToCleanup = this.currentTransfer
    this.currentTransfer = null // Clear reference immediately to prevent duplicate cleanup

    // Defer file I/O operations to avoid blocking UI
    if (transferToCleanup) {
      setImmediate(() => {
        // Close file handle if open
        if (transferToCleanup.fileHandle) {
          try {
            transferToCleanup.fileHandle.close()
          } catch {
            // Ignore close errors
          }
        }

        // Delete temp file if it exists
        try {
          const tempFile = new File(transferToCleanup.tempFilePath)
          if (tempFile.exists) {
            tempFile.delete()
          }
        } catch {
          // Ignore cleanup errors
        }

        // Clean up target file on failure if provided
        if (targetFilePath) {
          try {
            const targetFile = new File(targetFilePath)
            if (targetFile.exists) {
              targetFile.delete()
            }
          } catch {
            // Ignore cleanup errors
          }
        }
      })
    }
  }

  // ==================== Timeout Management ====================

  private startGlobalTimeout = () => {
    this.clearGlobalTimeout()
    this.globalTimeoutId = setTimeout(() => {
      if (this.currentTransfer) {
        this.completeTransfer(false, 'Global transfer timeout exceeded')
      }
    }, LAN_TRANSFER_GLOBAL_TIMEOUT_MS)
  }

  private clearGlobalTimeout = () => {
    if (this.globalTimeoutId) {
      clearTimeout(this.globalTimeoutId)
      this.globalTimeoutId = null
    }
  }

  // ==================== Communication ====================

  private sendJsonMessage = (payload: LanTransferOutgoingMessage) => {
    if (!this.clientSocket) {
      return
    }

    try {
      this.clientSocket.write(JSON.stringify(payload) + LAN_TRANSFER_MESSAGE_TERMINATOR)
    } catch (error) {
      logger.error('Failed to send TCP message', error)
    }
  }

  // ==================== Server Management ====================

  private handleServerError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown server error'
    logger.error('TCP server error', error)
    this.shutdownServer(LanTransferServerStatus.ERROR, message)
  }

  private shutdownServer = (nextStatus: LanTransferServerStatus, errorMessage?: string, clearLastError = false) => {
    if (this.currentTransfer) {
      this.cleanupTransfer()
    } else {
      this.clearGlobalTimeout()
    }

    // 先更新状态，让 UI 立即响应
    this.updateState({
      status: nextStatus,
      port: undefined,
      connectedClient: undefined,
      fileTransfer: undefined,
      lastError: clearLastError ? undefined : (errorMessage ?? this.state.lastError)
    })

    // 保存引用，异步关闭
    const socketToDestroy = this.clientSocket
    const serverToClose = this.server
    this.clientSocket = null
    this.server = null
    this.binaryBuffer = Buffer.alloc(0)

    // 异步执行网络关闭操作，不阻塞 UI
    setImmediate(() => {
      if (socketToDestroy) {
        try {
          socketToDestroy.destroy()
        } catch (error) {
          logger.warn('Error destroying client socket', error)
        }
      }

      if (serverToClose) {
        try {
          serverToClose.close()
        } catch (error) {
          logger.warn('Error closing TCP server', error)
        }
      }
    })
  }

  private cleanupClient = (keepServer = true, overrideStatus?: LanTransferServerStatus) => {
    if (this.currentTransfer) {
      this.cleanupTransfer()
    } else {
      this.clearGlobalTimeout()
    }

    if (this.clientSocket) {
      try {
        this.clientSocket.destroy()
      } catch (error) {
        logger.warn('Error while cleaning up client socket', error)
      }
      this.clientSocket = null
    }

    this.binaryBuffer = Buffer.alloc(0)
    const nextStatus =
      typeof overrideStatus !== 'undefined'
        ? overrideStatus
        : keepServer
          ? LanTransferServerStatus.LISTENING
          : LanTransferServerStatus.IDLE
    this.updateState({
      status: nextStatus,
      connectedClient: undefined,
      fileTransfer: undefined
    })
  }

  // ==================== State Management ====================

  private updateState = (partial: Partial<LanTransferState>) => {
    this.state = { ...this.state, ...partial }
    this.lastStateUpdateTime = Date.now()

    // Update cached snapshot with new object reference for useSyncExternalStore
    this.cachedSnapshot = {
      ...this.state,
      connectedClient: this.state.connectedClient ? { ...this.state.connectedClient } : undefined,
      fileTransfer: this.state.fileTransfer ? { ...this.state.fileTransfer } : undefined
    }
    this.notify()
  }

  private notify = () => {
    this.listeners.forEach(callback => callback())
  }

  // Return stable reference - only changes when updateState is called
  private getSnapshot = (): LanTransferState => this.cachedSnapshot
}

export const lanTransferService = new LanTransferService()

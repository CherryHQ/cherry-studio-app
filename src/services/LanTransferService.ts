import { Buffer } from 'buffer'
import { SHA256Algo, WordArray } from 'crypto-es'
import { File, type FileHandle } from 'expo-file-system'
import TcpSocket from 'react-native-tcp-socket'

import {
  LAN_TRANSFER_ALLOWED_EXTENSIONS,
  LAN_TRANSFER_ALLOWED_MIME_TYPES,
  LAN_TRANSFER_CHUNK_SIZE,
  LAN_TRANSFER_CHUNK_TIMEOUT_MS,
  LAN_TRANSFER_GLOBAL_TIMEOUT_MS,
  LAN_TRANSFER_MAX_FILE_SIZE,
  LAN_TRANSFER_MESSAGE_TERMINATOR,
  LAN_TRANSFER_PROTOCOL_VERSION,
  LAN_TRANSFER_TCP_PORT
} from '@/constants/lanTransfer'
import { DEFAULT_LAN_TRANSFER_STORAGE, DEFAULT_LAN_TRANSFER_TEMP } from '@/constants/storage'
import { loggerService } from '@/services/LoggerService'
import {
  type FileTransferProgress,
  FileTransferStatus,
  type LanTransferClientInfo,
  type LanTransferFileCancelMessage,
  type LanTransferFileChunkMessage,
  type LanTransferFileEndMessage,
  type LanTransferFileStartMessage,
  type LanTransferIncomingMessage,
  type LanTransferOutgoingMessage,
  LanTransferServerStatus,
  type LanTransferState
} from '@/types/lanTransfer'

const logger = loggerService.withContext('LanTransferService')

type TcpServer = ReturnType<typeof TcpSocket.createServer> | null
type TcpClientSocket = ReturnType<typeof TcpSocket.createConnection> | null

// P1-2: Message schema validation helpers
const isValidHandshakeMessage = (msg: unknown): msg is Extract<LanTransferIncomingMessage, { type: 'handshake' }> => {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as Record<string, unknown>
  return m.type === 'handshake' && typeof m.version === 'string' && typeof m.platform === 'string'
}

const isValidPingMessage = (msg: unknown): msg is Extract<LanTransferIncomingMessage, { type: 'ping' }> => {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as Record<string, unknown>
  return m.type === 'ping'
}

const isValidFileStartMessage = (msg: unknown): msg is LanTransferFileStartMessage => {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as Record<string, unknown>
  return (
    m.type === 'file_start' &&
    typeof m.transferId === 'string' &&
    typeof m.fileName === 'string' &&
    typeof m.fileSize === 'number' &&
    typeof m.mimeType === 'string' &&
    typeof m.checksum === 'string' &&
    typeof m.totalChunks === 'number' &&
    typeof m.chunkSize === 'number'
  )
}

const isValidFileChunkMessage = (msg: unknown): msg is LanTransferFileChunkMessage => {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as Record<string, unknown>
  return (
    m.type === 'file_chunk' &&
    typeof m.transferId === 'string' &&
    typeof m.chunkIndex === 'number' &&
    typeof m.data === 'string'
  )
}

const isValidFileEndMessage = (msg: unknown): msg is LanTransferFileEndMessage => {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as Record<string, unknown>
  return m.type === 'file_end' && typeof m.transferId === 'string'
}

const isValidFileCancelMessage = (msg: unknown): msg is LanTransferFileCancelMessage => {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as Record<string, unknown>
  return m.type === 'file_cancel' && typeof m.transferId === 'string'
}

interface InternalFileTransfer {
  transferId: string
  fileName: string
  fileSize: number
  expectedChecksum: string
  totalChunks: number
  chunkSize: number
  receivedChunks: Set<number>
  tempFilePath: string
  fileHandle: FileHandle | null // P0-1: Streaming write handle
  bytesReceived: number
  startTime: number
  lastChunkTime: number
  status: FileTransferStatus
  hasher: InstanceType<typeof SHA256Algo> | null // Incremental SHA-256 hasher
  nextHashIndex: number // Next chunk index to hash (for in-order hashing)
}

class LanTransferService {
  private server: TcpServer = null
  private clientSocket: TcpClientSocket = null
  private binaryBuffer = Buffer.alloc(0)
  private listeners = new Set<(state: LanTransferState) => void>()

  private currentTransfer: InternalFileTransfer | null = null
  private chunkTimeoutId: ReturnType<typeof setTimeout> | null = null
  private globalTimeoutId: ReturnType<typeof setTimeout> | null = null // P1-3: Global transfer timeout

  private state: LanTransferState = {
    status: LanTransferServerStatus.IDLE
  }

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

      this.server.listen({ port: LAN_TRANSFER_TCP_PORT, host: '0.0.0.0', reuseAddress: true }, () => {
        this.updateState({ status: LanTransferServerStatus.LISTENING })
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

  subscribe = (listener: (state: LanTransferState) => void) => {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = () => this.getSnapshot()

  private handleIncomingConnection = (socket: NonNullable<TcpClientSocket>) => {
    if (this.clientSocket) {
      this.clientSocket.destroy()
    }

    // P0-4: Clean up any existing transfer state before accepting new connection
    if (this.currentTransfer) {
      this.cleanupTransfer()
    }

    this.clientSocket = socket
    this.binaryBuffer = Buffer.alloc(0)

    this.updateState({ status: LanTransferServerStatus.HANDSHAKING, connectedClient: undefined })

    socket.on('data', this.handleSocketData)
    socket.on('error', error => {
      const message = error instanceof Error ? error.message : 'Unknown socket error'
      logger.error('Socket error', error)
      this.cleanupClient()
    })
    socket.on('close', hadError => {
      this.cleanupClient()
    })
  }

  private handleSocketData = (chunk: Buffer | string) => {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')
    this.binaryBuffer = Buffer.concat([this.binaryBuffer, incoming])

    while (this.binaryBuffer.length > 0) {
      // 二进制帧: Magic 0x43 0x53
      if (this.binaryBuffer.length >= 2 && this.binaryBuffer[0] === 0x43 && this.binaryBuffer[1] === 0x53) {
        if (!this.processBinaryFrame()) break
        continue
      }

      // JSON 消息以 '{' 开头
      if (this.binaryBuffer[0] === 0x7b) {
        if (!this.processJsonFromBuffer()) break
        continue
      }

      // 无法识别的前导字节，丢弃 1 字节以尝试重新对齐
      this.binaryBuffer = this.binaryBuffer.slice(1)
    }
  }

  // 处理带总长度字段的二进制帧: Magic(2) + TotalLen(4, BE, 不含 Magic+TotalLen) + Type(1) + TidLen(2) + Tid + ChunkIdx(4) + Data
  private processBinaryFrame(): boolean {
    // 至少需要 Magic(2) + TotalLen(4) + Type(1) + TidLen(2) + Tid(>=0) + ChunkIdx(4) => 最小 13 字节
    if (this.binaryBuffer.length < 13) return false

    const magicOk = this.binaryBuffer[0] === 0x43 && this.binaryBuffer[1] === 0x53
    if (!magicOk) {
      this.binaryBuffer = this.binaryBuffer.slice(1)
      return true
    }

    const totalLen = this.binaryBuffer.readUInt32BE(2) // 不含 magic+totalLen 本身
    const frameLen = 2 + 4 + totalLen
    if (this.binaryBuffer.length < frameLen) {
      // 不完整，等待更多数据
      return false
    }

    const type = this.binaryBuffer[6]
    const tidLen = this.binaryBuffer.readUInt16BE(7)
    const headerLen = 2 + 4 + 1 + 2 + tidLen + 4 // magic + totalLen + type + tidLen + tid + chunkIdx

    if (frameLen < headerLen) {
      // 丢弃当前帧以避免死循环
      this.binaryBuffer = this.binaryBuffer.slice(frameLen)
      return true
    }

    const transferId = this.binaryBuffer.toString('utf8', 9, 9 + tidLen)
    const chunkIndex = this.binaryBuffer.readUInt32BE(9 + tidLen)

    const dataStart = headerLen
    const dataLen = frameLen - headerLen
    if (dataLen < 0) {
      this.binaryBuffer = this.binaryBuffer.slice(frameLen)
      return true
    }

    // 完整帧已到，切片
    const frame = this.binaryBuffer.slice(0, frameLen)
    this.binaryBuffer = this.binaryBuffer.slice(frameLen)

    if (type !== 0x01) {
      return true
    }

    const data = frame.slice(dataStart, dataStart + dataLen)
    this.handleBinaryFileChunk(transferId, chunkIndex, data)
    return true
  }

  // 从缓冲区解析 JSON（以 terminator 分割）
  private processJsonFromBuffer(): boolean {
    const terminatorIndex = this.binaryBuffer.indexOf(LAN_TRANSFER_MESSAGE_TERMINATOR)
    if (terminatorIndex === -1) {
      // 终止符未到，等待更多数据
      return false
    }

    const rawMessage = this.binaryBuffer.slice(0, terminatorIndex).toString('utf8').trim()
    this.binaryBuffer = this.binaryBuffer.slice(terminatorIndex + LAN_TRANSFER_MESSAGE_TERMINATOR.length)

    if (rawMessage.length > 0) {
      this.handleJsonMessage(rawMessage)
    }
    return true
  }

  private handleJsonMessage = (rawMessage: string) => {
    let parsed: unknown = null

    try {
      parsed = JSON.parse(rawMessage)
    } catch (error) {
      logger.error('Malformed LAN transfer message', error)
      return
    }

    if (!parsed || typeof parsed !== 'object') {
      return
    }

    const msgType = (parsed as { type?: unknown }).type

    // P1-2: Validate message schema before processing
    switch (msgType) {
      case 'handshake':
        if (!isValidHandshakeMessage(parsed)) {
          return
        }
        this.handleHandshake(parsed)
        break
      case 'ping':
        if (!isValidPingMessage(parsed)) {
          return
        }
        this.handlePing(parsed)
        break
      case 'file_start':
        if (!isValidFileStartMessage(parsed)) {
          return
        }
        this.handleFileStart(parsed)
        break
      case 'file_chunk':
        if (!isValidFileChunkMessage(parsed)) {
          return
        }
        this.handleFileChunk(parsed)
        break
      case 'file_end':
        if (!isValidFileEndMessage(parsed)) {
          return
        }
        this.handleFileEnd(parsed)
        break
      case 'file_cancel':
        if (!isValidFileCancelMessage(parsed)) {
          return
        }
        this.handleFileCancel(parsed)
        break
      default:
        break
    }
  }

  private handleHandshake = (message: Extract<LanTransferIncomingMessage, { type: 'handshake' }>) => {
    const clientInfo: LanTransferClientInfo = {
      deviceName: message.deviceName || 'Unknown Device',
      platform: message.platform,
      version: message.version,
      appVersion: message.appVersion
    }

    if (message.version !== LAN_TRANSFER_PROTOCOL_VERSION) {
      const errorMessage = `Protocol mismatch: expected ${LAN_TRANSFER_PROTOCOL_VERSION}, received ${message.version}`
      this.sendJsonMessage({
        type: 'handshake_ack',
        accepted: false,
        message: errorMessage
      })
      this.cleanupClient()
      return
    }

    this.sendJsonMessage({
      type: 'handshake_ack',
      accepted: true
    })
    this.updateState({ status: LanTransferServerStatus.CONNECTED, connectedClient: clientInfo })
  }

  private handlePing = (message: Extract<LanTransferIncomingMessage, { type: 'ping' }>) => {
    if (this.state.status !== LanTransferServerStatus.CONNECTED) {
      return
    }

    this.sendJsonMessage({
      type: 'pong',
      received: true,
      payload: message.payload
    })
  }

  // ==================== File Transfer Handlers ====================

  private handleFileStart = (message: LanTransferFileStartMessage) => {
    // Validate preconditions
    if (
      this.state.status !== LanTransferServerStatus.CONNECTED &&
      this.state.status !== LanTransferServerStatus.RECEIVING_FILE
    ) {
      this.sendFileStartAck(message.transferId, false, 'Not connected')
      return
    }

    if (this.currentTransfer) {
      this.sendFileStartAck(message.transferId, false, 'Another transfer is in progress')
      return
    }

    // Validate file extension
    const ext = '.' + message.fileName.split('.').pop()?.toLowerCase()
    if (!LAN_TRANSFER_ALLOWED_EXTENSIONS.includes(ext)) {
      this.sendFileStartAck(message.transferId, false, `File type ${ext} not allowed`)
      return
    }

    // Validate MIME type
    if (!LAN_TRANSFER_ALLOWED_MIME_TYPES.includes(message.mimeType)) {
      this.sendFileStartAck(message.transferId, false, `MIME type ${message.mimeType} not allowed`)
      return
    }

    // Validate file size
    if (message.fileSize > LAN_TRANSFER_MAX_FILE_SIZE) {
      this.sendFileStartAck(
        message.transferId,
        false,
        `File too large (max ${LAN_TRANSFER_MAX_FILE_SIZE / 1024 / 1024}MB)`
      )
      return
    }

    // P0-2: Validate chunk size - must not exceed configured limit
    if (message.chunkSize > LAN_TRANSFER_CHUNK_SIZE) {
      this.sendFileStartAck(
        message.transferId,
        false,
        `Chunk size ${message.chunkSize} exceeds limit ${LAN_TRANSFER_CHUNK_SIZE}`
      )
      return
    }

    // P0-3: Cross-validate fileSize with totalChunks and chunkSize
    const expectedMinSize = (message.totalChunks - 1) * message.chunkSize + 1
    const expectedMaxSize = message.totalChunks * message.chunkSize
    if (message.fileSize < expectedMinSize || message.fileSize > expectedMaxSize) {
      this.sendFileStartAck(
        message.transferId,
        false,
        `File size ${message.fileSize} inconsistent with ${message.totalChunks} chunks of ${message.chunkSize} bytes`
      )
      return
    }

    // P0-5: Validate checksum format (SHA-256 = 64 hex characters)
    const checksumRegex = /^[a-fA-F0-9]{64}$/
    if (!checksumRegex.test(message.checksum)) {
      this.sendFileStartAck(message.transferId, false, 'Invalid checksum format (expected 64 hex characters)')
      return
    }

    // P1-5: Ensure directories exist with proper error handling
    try {
      if (!DEFAULT_LAN_TRANSFER_STORAGE.exists) {
        DEFAULT_LAN_TRANSFER_STORAGE.create({ intermediates: true })
      }
      if (!DEFAULT_LAN_TRANSFER_TEMP.exists) {
        DEFAULT_LAN_TRANSFER_TEMP.create({ intermediates: true })
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Failed to create storage directories', error)
      this.sendFileStartAck(message.transferId, false, `Storage unavailable: ${errorMsg}`)
      return
    }

    // Create temp file path
    const tempFileName = `${message.transferId}.tmp`
    const tempFile = new File(DEFAULT_LAN_TRANSFER_TEMP, tempFileName)

    try {
      if (tempFile.exists) {
        tempFile.delete()
      }

      // P0-1: Create file and open handle for streaming writes
      tempFile.create()
      const fileHandle = tempFile.open()

      this.currentTransfer = {
        transferId: message.transferId,
        fileName: message.fileName,
        fileSize: message.fileSize,
        expectedChecksum: message.checksum,
        totalChunks: message.totalChunks,
        chunkSize: message.chunkSize,
        receivedChunks: new Set(),
        tempFilePath: tempFile.uri,
        fileHandle, // P0-1: Streaming write handle
        bytesReceived: 0,
        startTime: Date.now(),
        lastChunkTime: Date.now(),
        status: FileTransferStatus.RECEIVING,
        hasher: SHA256Algo.create(), // Incremental SHA-256 hasher
        nextHashIndex: 0 // Start hashing from chunk 0
      }

      this.updateState({
        status: LanTransferServerStatus.RECEIVING_FILE,
        fileTransfer: this.getTransferProgress()
      })

      this.sendFileStartAck(message.transferId, true)
      this.startChunkTimeout()
      this.startGlobalTimeout() // P1-3: Start global transfer timeout
    } catch (error) {
      logger.error('Failed to initialize file transfer', error)
      this.sendFileStartAck(message.transferId, false, 'Failed to create temp file')
    }
  }

  private handleFileChunk = (message: LanTransferFileChunkMessage) => {
    // P1-1: Validate server status - only accept chunks in RECEIVING_FILE state
    if (this.state.status !== LanTransferServerStatus.RECEIVING_FILE) {
      this.sendChunkAck(message.transferId, message.chunkIndex, false, 'Not in receiving state')
      return
    }

    if (!this.currentTransfer || this.currentTransfer.transferId !== message.transferId) {
      this.sendChunkAck(message.transferId, message.chunkIndex, false, 'No active transfer')
      return
    }

    if (this.currentTransfer.receivedChunks.has(message.chunkIndex)) {
      // Duplicate chunk, just acknowledge
      this.sendChunkAck(message.transferId, message.chunkIndex, true)
      return
    }

    try {
      const binaryData = Buffer.from(message.data, 'base64')
      this.handleBinaryFileChunk(message.transferId, message.chunkIndex, binaryData)
    } catch (error) {
      logger.error(`Failed to process chunk ${message.chunkIndex}`, error)
      this.sendChunkAck(message.transferId, message.chunkIndex, false, 'Failed to process chunk')
      // P0-4: Clean up timeout and fail the transfer on chunk processing error
      this.completeTransfer(false, `Failed to process chunk ${message.chunkIndex}`)
    }
  }

  // 二进制帧到达后直接处理，无 Base64
  private handleBinaryFileChunk = (transferId: string, chunkIndex: number, data: Buffer) => {
    // P1-1: Validate server status - only accept chunks in RECEIVING_FILE state
    if (this.state.status !== LanTransferServerStatus.RECEIVING_FILE) {
      this.sendChunkAck(transferId, chunkIndex, false, 'Not in receiving state')
      return
    }

    if (!this.currentTransfer || this.currentTransfer.transferId !== transferId) {
      this.sendChunkAck(transferId, chunkIndex, false, 'No active transfer')
      return
    }

    if (this.currentTransfer.receivedChunks.has(chunkIndex)) {
      // Duplicate chunk, just acknowledge
      this.sendChunkAck(transferId, chunkIndex, true)
      return
    }

    try {
      const chunk = new Uint8Array(data)

      // P0-1: Write chunk directly to file (streaming write)
      const { fileHandle, chunkSize } = this.currentTransfer
      if (fileHandle) {
        fileHandle.offset = chunkIndex * chunkSize
        fileHandle.writeBytes(chunk)
      }

      // Update tracking
      this.currentTransfer.receivedChunks.add(chunkIndex)
      this.currentTransfer.bytesReceived += chunk.length
      this.currentTransfer.lastChunkTime = Date.now()

      // Incremental hashing: hash chunks in order for faster completion
      if (chunkIndex === this.currentTransfer.nextHashIndex && this.currentTransfer.hasher) {
        this.currentTransfer.hasher.update(WordArray.create(chunk))
        this.currentTransfer.nextHashIndex++
      }

      // Reset timeout
      this.resetChunkTimeout()

      // Update state for UI
      this.updateState({
        fileTransfer: this.getTransferProgress()
      })

      // Send acknowledgment
      this.sendChunkAck(transferId, chunkIndex, true)
    } catch (error) {
      logger.error(`Failed to process chunk ${chunkIndex}`, error)
      this.sendChunkAck(transferId, chunkIndex, false, 'Failed to process chunk')
      // P0-4: Clean up timeout and fail the transfer on chunk processing error
      this.completeTransfer(false, `Failed to process chunk ${chunkIndex}`)
    }
  }

  private handleFileEnd = async (message: LanTransferFileEndMessage) => {
    if (!this.currentTransfer || this.currentTransfer.transferId !== message.transferId) {
      return
    }

    this.clearChunkTimeout()
    this.currentTransfer.status = FileTransferStatus.VERIFYING
    this.updateState({ fileTransfer: this.getTransferProgress() })

    // Check all chunks received
    if (this.currentTransfer.receivedChunks.size !== this.currentTransfer.totalChunks) {
      const missing: number[] = []
      for (let i = 0; i < this.currentTransfer.totalChunks; i++) {
        if (!this.currentTransfer.receivedChunks.has(i)) {
          missing.push(i)
        }
      }
      this.completeTransfer(
        false,
        `Missing chunks: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`
      )
      return
    }

    // P0-1: Close file handle before verification
    if (this.currentTransfer.fileHandle) {
      try {
        this.currentTransfer.fileHandle.close()
      } catch {
        // Ignore close errors
      }
      this.currentTransfer.fileHandle = null
    }

    try {
      let actualChecksum: string

      // Check if we hashed all chunks incrementally (in-order arrival)
      if (
        this.currentTransfer.nextHashIndex === this.currentTransfer.totalChunks &&
        this.currentTransfer.hasher
      ) {
        // All chunks were hashed in order - just finalize (fast path)
        actualChecksum = this.currentTransfer.hasher.finalize().toString()
      } else {
        // Some chunks arrived out of order - fall back to reading unhashed portions
        actualChecksum = await this.computeRemainingChecksum()
      }

      if (actualChecksum.toLowerCase() !== this.currentTransfer.expectedChecksum.toLowerCase()) {
        this.completeTransfer(false, 'Checksum mismatch')
        return
      }

      // Move to final location
      this.currentTransfer.status = FileTransferStatus.COMPLETING
      this.updateState({ fileTransfer: this.getTransferProgress() })

      // P0-1: Move temp file to final location (data already written during chunk processing)
      const tempFile = new File(this.currentTransfer.tempFilePath)
      const finalFile = new File(DEFAULT_LAN_TRANSFER_STORAGE, this.currentTransfer.fileName)

      try {
        if (finalFile.exists) {
          finalFile.delete()
        }
        tempFile.move(finalFile)
        this.completeTransfer(true, undefined, finalFile.uri)
      } catch (moveError) {
        logger.error('Failed to move file to final location', moveError)
        this.completeTransfer(false, 'Failed to move file', undefined, finalFile.uri)
      }
    } catch (error) {
      logger.error('Failed to verify file', error)
      this.completeTransfer(false, 'Verification failed')
    }
  }

  private handleFileCancel = (message: LanTransferFileCancelMessage) => {
    if (!this.currentTransfer || this.currentTransfer.transferId !== message.transferId) {
      return
    }

    this.cleanupTransfer()
    this.updateState({
      status: LanTransferServerStatus.CONNECTED,
      fileTransfer: undefined,
      transferCancelled: true
    })
  }

  // ==================== File Transfer Helpers ====================

  // P1-4: Added failedTargetPath parameter for cleanup on write failure
  private completeTransfer = (success: boolean, error?: string, filePath?: string, failedTargetPath?: string) => {
    if (!this.currentTransfer) return

    const duration = Date.now() - this.currentTransfer.startTime

    if (success) {
      this.currentTransfer.status = FileTransferStatus.COMPLETE
    } else {
      this.currentTransfer.status = FileTransferStatus.ERROR
    }

    this.sendJsonMessage({
      type: 'file_complete',
      transferId: this.currentTransfer.transferId,
      success,
      filePath,
      error
    })

    this.updateState({
      status: LanTransferServerStatus.CONNECTED,
      fileTransfer: success ? undefined : { ...this.getTransferProgress()!, error },
      completedFilePath: success ? filePath : undefined
    })

    this.cleanupTransfer(failedTargetPath)
  }

  private cleanupTransfer = (targetFilePath?: string) => {
    this.clearChunkTimeout()
    this.clearGlobalTimeout() // P1-3: Clear global timeout

    if (this.currentTransfer) {
      // P0-1: Close file handle if open
      if (this.currentTransfer.fileHandle) {
        try {
          this.currentTransfer.fileHandle.close()
        } catch {
          // Ignore close errors
        }
        this.currentTransfer.fileHandle = null
      }

      // Clear incremental hasher
      this.currentTransfer.hasher = null

      // Delete temp file if it exists
      try {
        const tempFile = new File(this.currentTransfer.tempFilePath)
        if (tempFile.exists) {
          tempFile.delete()
        }
      } catch {
        // Ignore cleanup errors
      }

      // P1-4: Clean up target file on failure if provided
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
    }

    this.currentTransfer = null
  }

  public clearCompletedFile = () => {
    this.updateState({ completedFilePath: undefined })
  }

  public clearTransferCancelled = () => {
    this.updateState({ transferCancelled: undefined })
  }

  private computeFileChecksum = async (filePath: string): Promise<string> => {
    const file = new File(filePath)
    if (!file.exists) {
      throw new Error('Temp file not found')
    }

    const fileHandle = file.open()

    try {
      fileHandle.offset = 0

      const hasher = SHA256Algo.create()
      const bufferSizeBytes = 256 * 1024
      let iterations = 0

      // Read sequentially to compute checksum (works even if chunks arrived out-of-order).
      while (true) {
        const bytes = fileHandle.readBytes(bufferSizeBytes)
        if (bytes.length === 0) {
          break
        }

        hasher.update(WordArray.create(bytes))
        iterations += 1

        // Yield occasionally to avoid blocking the JS thread for too long.
        if (iterations % 64 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }

      return hasher.finalize().toString()
    } finally {
      try {
        fileHandle.close()
      } catch {
        // Ignore close errors
      }
    }
  }

  // Fallback: Continue hashing from where incremental hashing left off (for out-of-order chunks)
  private computeRemainingChecksum = async (): Promise<string> => {
    if (!this.currentTransfer) {
      throw new Error('No active transfer')
    }

    const { hasher, nextHashIndex, chunkSize, tempFilePath } = this.currentTransfer
    const file = new File(tempFilePath)
    const fileHandle = file.open()

    try {
      // Use existing hasher and continue from where we left off,
      // or create new hasher and start from beginning if none exists
      const finalHasher = hasher || SHA256Algo.create()
      fileHandle.offset = hasher ? nextHashIndex * chunkSize : 0

      const bufferSize = 256 * 1024
      let iterations = 0

      while (true) {
        const bytes = fileHandle.readBytes(bufferSize)
        if (bytes.length === 0) {
          break
        }
        finalHasher.update(WordArray.create(bytes))
        iterations++

        // Yield occasionally to avoid blocking the JS thread
        if (iterations % 64 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0))
        }
      }

      return finalHasher.finalize().toString()
    } finally {
      try {
        fileHandle.close()
      } catch {
        // Ignore close errors
      }
    }
  }

  private sendFileStartAck = (transferId: string, accepted: boolean, message?: string) => {
    this.sendJsonMessage({
      type: 'file_start_ack',
      transferId,
      accepted,
      message
    })
  }

  private sendChunkAck = (transferId: string, chunkIndex: number, received: boolean, error?: string) => {
    this.sendJsonMessage({
      type: 'file_chunk_ack',
      transferId,
      chunkIndex,
      received,
      error
    })
  }

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

  private startChunkTimeout = () => {
    this.chunkTimeoutId = setTimeout(() => {
      if (this.currentTransfer) {
        this.completeTransfer(false, 'Timeout')
      }
    }, LAN_TRANSFER_CHUNK_TIMEOUT_MS)
  }

  private resetChunkTimeout = () => {
    this.clearChunkTimeout()
    this.startChunkTimeout()
  }

  private clearChunkTimeout = () => {
    if (this.chunkTimeoutId) {
      clearTimeout(this.chunkTimeoutId)
      this.chunkTimeoutId = null
    }
  }

  // P1-3: Global transfer timeout management
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

  private formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  private formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  // ==================== End File Transfer ====================

  private handleServerError = (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown server error'
    logger.error('TCP server error', error)
    this.shutdownServer(LanTransferServerStatus.ERROR, message)
  }

  private sendJsonMessage = (payload: LanTransferOutgoingMessage) => {
    if (!this.clientSocket) {
      return
    }

    try {
      this.clientSocket.write(JSON.stringify(payload) + LAN_TRANSFER_MESSAGE_TERMINATOR)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error when sending data'
      logger.error('Failed to send TCP message', error)
    }
  }

  private shutdownServer = (nextStatus: LanTransferServerStatus, errorMessage?: string, clearLastError = false) => {
    if (this.currentTransfer) {
      this.cleanupTransfer()
    } else {
      this.clearChunkTimeout()
      this.clearGlobalTimeout()
    }

    if (this.clientSocket) {
      try {
        this.clientSocket.destroy()
      } catch (error) {
        logger.warn('Error destroying client socket', error)
      }
      this.clientSocket = null
    }

    if (this.server) {
      try {
        this.server.close()
      } catch (error) {
        logger.warn('Error closing TCP server', error)
      }
      this.server = null
    }

    this.binaryBuffer = Buffer.alloc(0)
    this.updateState({
      status: nextStatus,
      connectedClient: undefined,
      fileTransfer: undefined,
      lastError: clearLastError ? undefined : (errorMessage ?? this.state.lastError)
    })
  }

  private cleanupClient = (keepServer = true, overrideStatus?: LanTransferServerStatus) => {
    if (this.currentTransfer) {
      this.cleanupTransfer()
    } else {
      this.clearChunkTimeout()
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

  private updateState = (partial: Partial<LanTransferState>) => {
    this.state = { ...this.state, ...partial }
    this.notify()
  }

  private notify = () => {
    const snapshot = this.getSnapshot()
    this.listeners.forEach(listener => listener(snapshot))
  }

  private getSnapshot = (): LanTransferState => ({
    ...this.state,
    connectedClient: this.state.connectedClient ? { ...this.state.connectedClient } : undefined,
    fileTransfer: this.state.fileTransfer ? { ...this.state.fileTransfer } : undefined
  })
}

export const lanTransferService = new LanTransferService()

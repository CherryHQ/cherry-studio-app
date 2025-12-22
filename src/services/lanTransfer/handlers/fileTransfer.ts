import { Buffer } from 'buffer'
import { File } from 'expo-file-system'

import {
  LAN_TRANSFER_ALLOWED_EXTENSIONS,
  LAN_TRANSFER_ALLOWED_MIME_TYPES,
  LAN_TRANSFER_CHUNK_SIZE
} from '@/constants/lanTransfer'
import { DEFAULT_LAN_TRANSFER_STORAGE, DEFAULT_LAN_TRANSFER_TEMP } from '@/constants/storage'
import { loggerService } from '@/services/LoggerService'
import type {
  FileTransferProgress,
  LanTransferFileChunkMessage,
  LanTransferFileCompleteErrorCode,
  LanTransferFileEndMessage,
  LanTransferFileStartMessage,
  LanTransferOutgoingMessage
} from '@/types/lanTransfer'
import { FileTransferStatus, LanTransferServerStatus } from '@/types/lanTransfer'

import type { InternalFileTransfer } from '../types'

const logger = loggerService.withContext('FileTransferHandler')

// SHA-256 checksum regex (64 hex characters)
const CHECKSUM_REGEX = /^[a-fA-F0-9]{64}$/

// Memory buffer flush threshold (512KB) - balances memory usage vs I/O frequency
const FLUSH_THRESHOLD = 512 * 1024

interface FileTransferContext {
  sendJsonMessage: (payload: LanTransferOutgoingMessage) => void
  updateState: (partial: object) => void
  getStatus: () => LanTransferServerStatus
  getCurrentTransfer: () => InternalFileTransfer | null
  setCurrentTransfer: (transfer: InternalFileTransfer | null) => void
  getTransferProgress: () => FileTransferProgress | undefined
  cleanupTransfer: (targetFilePath?: string) => void
  completeTransfer: (
    success: boolean,
    error?: string,
    filePath?: string,
    failedTargetPath?: string,
    errorCode?: LanTransferFileCompleteErrorCode
  ) => void
  startGlobalTimeout: () => void
  onProgressUpdate?: () => void
}

/**
 * Send file_start_ack message
 */
const sendFileStartAck = (
  context: FileTransferContext,
  transferId: string,
  accepted: boolean,
  message?: string
): void => {
  context.sendJsonMessage({
    type: 'file_start_ack',
    transferId,
    accepted,
    message
  })
}

/**
 * Handle file_start message
 */
export const handleFileStart = (message: LanTransferFileStartMessage, context: FileTransferContext): void => {
  const status = context.getStatus()

  // Validate preconditions
  if (status !== LanTransferServerStatus.CONNECTED && status !== LanTransferServerStatus.RECEIVING_FILE) {
    sendFileStartAck(context, message.transferId, false, 'Not connected')
    return
  }

  if (context.getCurrentTransfer()) {
    sendFileStartAck(context, message.transferId, false, 'Another transfer is in progress')
    return
  }

  // Validate file extension
  const ext = '.' + message.fileName.split('.').pop()?.toLowerCase()
  if (!LAN_TRANSFER_ALLOWED_EXTENSIONS.includes(ext)) {
    sendFileStartAck(context, message.transferId, false, `File type ${ext} not allowed`)
    return
  }

  // Validate MIME type
  if (!LAN_TRANSFER_ALLOWED_MIME_TYPES.includes(message.mimeType)) {
    sendFileStartAck(context, message.transferId, false, `MIME type ${message.mimeType} not allowed`)
    return
  }

  // Validate chunk size
  if (message.chunkSize > LAN_TRANSFER_CHUNK_SIZE) {
    sendFileStartAck(
      context,
      message.transferId,
      false,
      `Chunk size ${message.chunkSize} exceeds limit ${LAN_TRANSFER_CHUNK_SIZE}`
    )
    return
  }

  // Cross-validate fileSize with totalChunks and chunkSize
  const expectedMinSize = (message.totalChunks - 1) * message.chunkSize + 1
  const expectedMaxSize = message.totalChunks * message.chunkSize
  if (message.fileSize < expectedMinSize || message.fileSize > expectedMaxSize) {
    sendFileStartAck(
      context,
      message.transferId,
      false,
      `File size ${message.fileSize} inconsistent with ${message.totalChunks} chunks of ${message.chunkSize} bytes`
    )
    return
  }

  // Validate checksum format
  if (!CHECKSUM_REGEX.test(message.checksum)) {
    sendFileStartAck(context, message.transferId, false, 'Invalid checksum format (expected 64 hex characters)')
    return
  }

  // Ensure directories exist
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
    sendFileStartAck(context, message.transferId, false, `Storage unavailable: ${errorMsg}`)
    return
  }

  // Create temp file
  const tempFileName = `${message.transferId}.tmp`
  const tempFile = new File(DEFAULT_LAN_TRANSFER_TEMP, tempFileName)

  try {
    if (tempFile.exists) {
      tempFile.delete()
    }

    // Create file and open handle for streaming writes
    tempFile.create()
    const fileHandle = tempFile.open()

    const transfer: InternalFileTransfer = {
      transferId: message.transferId,
      fileName: message.fileName,
      fileSize: message.fileSize,
      expectedChecksum: message.checksum,
      totalChunks: message.totalChunks,
      chunkSize: message.chunkSize,
      receivedChunks: new Set(),
      tempFilePath: tempFile.uri,
      fileHandle,
      bytesReceived: 0,
      startTime: Date.now(),
      lastChunkTime: Date.now(),
      status: FileTransferStatus.RECEIVING,
      // Memory buffer for batched disk writes (reduces UI blocking)
      pendingChunks: new Map(),
      pendingBytesSize: 0,
      flushScheduled: false
    }

    context.setCurrentTransfer(transfer)
    context.updateState({
      status: LanTransferServerStatus.RECEIVING_FILE,
      fileTransfer: context.getTransferProgress()
    })

    sendFileStartAck(context, message.transferId, true)
    context.startGlobalTimeout()
  } catch (error) {
    logger.error('Failed to initialize file transfer', error)
    sendFileStartAck(context, message.transferId, false, 'Failed to create temp file')
  }
}

/**
 * Handle file_chunk message (JSON mode - for backward compatibility)
 * v1: Streaming mode, no ACK sent
 */
export const handleFileChunk = (message: LanTransferFileChunkMessage, context: FileTransferContext): void => {
  if (context.getStatus() !== LanTransferServerStatus.RECEIVING_FILE) {
    logger.debug('Ignoring file_chunk: not in RECEIVING_FILE state', {
      transferId: message.transferId,
      chunkIndex: message.chunkIndex
    })
    return
  }

  const currentTransfer = context.getCurrentTransfer()
  if (!currentTransfer || currentTransfer.transferId !== message.transferId) {
    logger.debug('Ignoring file_chunk: no active transfer or transfer ID mismatch', {
      receivedTransferId: message.transferId,
      activeTransferId: currentTransfer?.transferId
    })
    return
  }

  // Only accept chunks while actively receiving
  if (currentTransfer.status !== FileTransferStatus.RECEIVING) {
    logger.debug('Ignoring file_chunk: transfer not in RECEIVING status', {
      transferId: message.transferId,
      status: currentTransfer.status
    })
    return
  }

  if (currentTransfer.receivedChunks.has(message.chunkIndex)) {
    logger.debug('Duplicate chunk received (JSON mode), ignoring', {
      transferId: message.transferId,
      chunkIndex: message.chunkIndex
    })
    return
  }

  try {
    const binaryData = Buffer.from(message.data, 'base64')
    handleBinaryFileChunk(message.transferId, message.chunkIndex, binaryData, context)
  } catch (error) {
    logger.error(`Failed to process chunk ${message.chunkIndex}`, error)
    context.completeTransfer(false, `Failed to process chunk ${message.chunkIndex}`, undefined, undefined, 'DISK_ERROR')
  }
}

/**
 * Flush pending chunks from memory buffer to disk
 * Uses setImmediate to avoid blocking the current event loop iteration
 */
const flushPendingChunksNow = (transfer: InternalFileTransfer, context: FileTransferContext): boolean => {
  if (transfer.status !== FileTransferStatus.RECEIVING) {
    return true
  }

  const { fileHandle, chunkSize } = transfer
  if (!fileHandle) {
    if (transfer.pendingChunks.size === 0) {
      return true
    }
    context.completeTransfer(false, 'Disk write error', undefined, undefined, 'DISK_ERROR')
    return false
  }

  if (transfer.pendingChunks.size === 0) {
    return true
  }

  const chunksToWrite = new Map(transfer.pendingChunks)
  transfer.pendingChunks.clear()
  transfer.pendingBytesSize = 0

  try {
    for (const [idx, data] of chunksToWrite) {
      fileHandle.offset = idx * chunkSize
      fileHandle.writeBytes(data)
    }
    return true
  } catch (error) {
    logger.error('Failed to flush chunks to disk', error)
    context.completeTransfer(false, 'Disk write error', undefined, undefined, 'DISK_ERROR')
    return false
  }
}

const scheduleFlushPendingChunks = (transfer: InternalFileTransfer, context: FileTransferContext): void => {
  if (transfer.flushScheduled || transfer.status !== FileTransferStatus.RECEIVING) {
    return
  }

  transfer.flushScheduled = true

  // Defer disk writes to next event loop iteration, allowing UI to update
  setImmediate(() => {
    transfer.flushScheduled = false
    flushPendingChunksNow(transfer, context)
  })
}

/**
 * Handle binary file chunk (from binary frame parser)
 * v1: Streaming mode with memory buffering to reduce UI blocking
 */
export const handleBinaryFileChunk = (
  transferId: string,
  chunkIndex: number,
  data: Buffer,
  context: FileTransferContext
): void => {
  if (context.getStatus() !== LanTransferServerStatus.RECEIVING_FILE) {
    logger.debug('Ignoring binary chunk: not in RECEIVING_FILE state', {
      transferId,
      chunkIndex,
      dataSize: data.length
    })
    return
  }

  const currentTransfer = context.getCurrentTransfer()
  if (!currentTransfer || currentTransfer.transferId !== transferId) {
    logger.debug('Ignoring binary chunk: no active transfer or transfer ID mismatch', {
      receivedTransferId: transferId,
      activeTransferId: currentTransfer?.transferId,
      chunkIndex
    })
    return
  }

  // Only accept chunks while actively receiving
  if (currentTransfer.status !== FileTransferStatus.RECEIVING) {
    logger.debug('Ignoring binary chunk: transfer not in RECEIVING status', {
      transferId,
      status: currentTransfer.status,
      chunkIndex
    })
    return
  }

  if (currentTransfer.receivedChunks.has(chunkIndex)) {
    logger.debug('Duplicate chunk received, ignoring', {
      transferId,
      chunkIndex
    })
    return
  }

  try {
    const chunk = new Uint8Array(data)

    // Store chunk in memory buffer (non-blocking)
    currentTransfer.pendingChunks.set(chunkIndex, chunk)
    currentTransfer.pendingBytesSize += chunk.length

    // Update tracking
    currentTransfer.receivedChunks.add(chunkIndex)
    currentTransfer.bytesReceived += chunk.length
    currentTransfer.lastChunkTime = Date.now()

    // Flush to disk when buffer reaches threshold
    if (currentTransfer.pendingBytesSize >= FLUSH_THRESHOLD) {
      scheduleFlushPendingChunks(currentTransfer, context)
    }

    // Notify progress update (throttled in main service)
    context.onProgressUpdate?.()
  } catch (error) {
    logger.error(`Failed to process chunk ${chunkIndex}`, error)
    context.completeTransfer(false, `Failed to process chunk ${chunkIndex}`, undefined, undefined, 'DISK_ERROR')
  }
}

/**
 * Handle file_end message
 */
export const handleFileEnd = (message: LanTransferFileEndMessage, context: FileTransferContext): void => {
  const currentTransfer = context.getCurrentTransfer()
  if (!currentTransfer || currentTransfer.transferId !== message.transferId) {
    return
  }

  if (currentTransfer.status !== FileTransferStatus.RECEIVING) {
    return
  }

  // Check all chunks received
  if (currentTransfer.receivedChunks.size !== currentTransfer.totalChunks) {
    const missing: number[] = []
    for (let i = 0; i < currentTransfer.totalChunks; i++) {
      if (!currentTransfer.receivedChunks.has(i)) {
        missing.push(i)
      }
    }
    context.completeTransfer(
      false,
      `Missing chunks: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '...' : ''}`,
      undefined,
      undefined,
      'INCOMPLETE_TRANSFER'
    )
    return
  }

  // Flush any remaining buffered chunks (synchronous to ensure data integrity)
  const flushed = flushPendingChunksNow(currentTransfer, context)
  if (!flushed) {
    return
  }

  // Close file handle
  if (currentTransfer.fileHandle) {
    try {
      currentTransfer.fileHandle.close()
    } catch (error) {
      logger.warn('Failed to close file handle in handleFileEnd', error, {
        transferId: currentTransfer.transferId
      })
    }
    currentTransfer.fileHandle = null
  }

  // v1: No hash verification - TCP provides checksum, move directly to final location
  currentTransfer.status = FileTransferStatus.COMPLETING
  context.updateState({ fileTransfer: context.getTransferProgress() })

  const tempFile = new File(currentTransfer.tempFilePath)
  const finalFile = new File(DEFAULT_LAN_TRANSFER_STORAGE, currentTransfer.fileName)

  try {
    if (finalFile.exists) {
      finalFile.delete()
    }
    tempFile.move(finalFile)
    context.completeTransfer(true, undefined, finalFile.uri)
  } catch (moveError) {
    logger.error('Failed to move file to final location', moveError)
    context.completeTransfer(false, 'Failed to move file', undefined, finalFile.uri, 'DISK_ERROR')
  }
}

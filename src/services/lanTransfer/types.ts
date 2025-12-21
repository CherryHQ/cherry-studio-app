import type { FileHandle } from 'expo-file-system'
import type TcpSocket from 'react-native-tcp-socket'

import type {
  FileTransferProgress,
  FileTransferStatus,
  LanTransferFileCompleteErrorCode,
  LanTransferOutgoingMessage,
  LanTransferState
} from '@/types/lanTransfer'

/**
 * Internal file transfer state
 */
export interface InternalFileTransfer {
  transferId: string
  fileName: string
  fileSize: number
  expectedChecksum: string
  totalChunks: number
  chunkSize: number
  receivedChunks: Set<number>
  tempFilePath: string
  fileHandle: FileHandle | null
  bytesReceived: number
  startTime: number
  lastChunkTime: number
  status: FileTransferStatus

  // Memory buffer for pending chunks (reduces blocking disk I/O)
  pendingChunks: Map<number, Uint8Array> // chunkIndex -> data
  pendingBytesSize: number // Current buffer size in bytes

  // Disk flush scheduling (avoid clearing buffer before flush actually runs)
  flushScheduled: boolean
}

/**
 * TCP Server type
 */
export type TcpServer = ReturnType<typeof TcpSocket.createServer> | null

/**
 * TCP Client Socket type
 */
export type TcpClientSocket = ReturnType<typeof TcpSocket.createConnection> | null

/**
 * Service context passed to handlers
 */
export interface ServiceContext {
  sendJsonMessage: (payload: LanTransferOutgoingMessage) => void
  updateState: (partial: Partial<LanTransferState>) => void
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
  clearGlobalTimeout: () => void
}

/**
 * Throttle function type
 */
export type ThrottledFunction<T extends (...args: unknown[]) => void> = T & {
  cancel: () => void
}

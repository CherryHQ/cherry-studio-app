import type { FileHandle } from 'expo-file-system'
import type TcpSocket from 'react-native-tcp-socket'

import type { FileTransferStatus } from '@/types/lanTransfer'

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
  sendJsonMessage: (payload: object) => void
  updateState: (partial: object) => void
  getCurrentTransfer: () => InternalFileTransfer | null
  setCurrentTransfer: (transfer: InternalFileTransfer | null) => void
  getTransferProgress: () => object | undefined
  cleanupTransfer: (targetFilePath?: string) => void
  completeTransfer: (
    success: boolean,
    error?: string,
    filePath?: string,
    failedTargetPath?: string,
    errorCode?: string
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

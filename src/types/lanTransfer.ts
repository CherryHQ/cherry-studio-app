export enum LanTransferServerStatus {
  IDLE = 'idle',
  STARTING = 'starting',
  LISTENING = 'listening',
  HANDSHAKING = 'handshaking',
  CONNECTED = 'connected',
  RECEIVING_FILE = 'receiving_file',
  ERROR = 'error'
}

export enum FileTransferStatus {
  IDLE = 'idle',
  RECEIVING = 'receiving',
  COMPLETING = 'completing',
  COMPLETE = 'complete',
  ERROR = 'error'
}

export interface LanTransferClientInfo {
  deviceName: string
  platform?: string
  version?: string
  appVersion?: string
}

export interface FileTransferProgress {
  transferId: string
  fileName: string
  fileSize: number
  bytesReceived: number
  percentage: number
  chunksReceived: number
  totalChunks: number
  status: FileTransferStatus
  error?: string
  startTime: number
  elapsedMs?: number
  estimatedRemainingMs?: number
}

export interface LanTransferState {
  status: LanTransferServerStatus
  port?: number
  connectedClient?: LanTransferClientInfo
  lastError?: string
  fileTransfer?: FileTransferProgress
  completedFilePath?: string
}

export interface LanTransferHandshakeMessage {
  type: 'handshake'
  deviceName: string
  version: string
  platform?: string
  appVersion?: string
}

export interface LanTransferHandshakeAckMessage {
  type: 'handshake_ack'
  accepted: boolean
  message?: string
}

export interface LanTransferPingMessage {
  type: 'ping'
  payload?: string
}

export interface LanTransferPongMessage {
  type: 'pong'
  received: boolean
  payload?: string
}

// File transfer messages (Electron -> Mobile)
export interface LanTransferFileStartMessage {
  type: 'file_start'
  transferId: string
  fileName: string
  fileSize: number
  mimeType: string
  checksum: string
  totalChunks: number
  chunkSize: number
}

// v1: data 字段仅用于 JSON 模式兼容，二进制帧模式下不使用
// v1: 移除 chunkChecksum - 依赖最终文件校验
export interface LanTransferFileChunkMessage {
  type: 'file_chunk'
  transferId: string
  chunkIndex: number
  data: string // Base64 encoded (仅 JSON 模式)
}

export interface LanTransferFileEndMessage {
  type: 'file_end'
  transferId: string
}

// File transfer response messages (Mobile -> Electron)
export interface LanTransferFileStartAckMessage {
  type: 'file_start_ack'
  transferId: string
  accepted: boolean
  message?: string
}

// v1: LanTransferFileChunkAckMessage removed - streaming mode, no per-chunk ACK

export type LanTransferFileCompleteErrorCode = 'CHECKSUM_MISMATCH' | 'INCOMPLETE_TRANSFER' | 'DISK_ERROR'

export interface LanTransferFileCompleteMessage {
  type: 'file_complete'
  transferId: string
  success: boolean
  filePath?: string
  error?: string
  // v1 new fields
  errorCode?: LanTransferFileCompleteErrorCode
  receivedChunks?: number
  receivedBytes?: number
}

// Generic error message for protocol-level errors
export interface LanTransferErrorMessage {
  type: 'error'
  error: string
  errorCode?: string
}

export type LanTransferIncomingMessage =
  | LanTransferHandshakeMessage
  | LanTransferPingMessage
  | LanTransferFileStartMessage
  | LanTransferFileChunkMessage
  | LanTransferFileEndMessage

// v1: LanTransferFileChunkAckMessage removed from union - streaming mode
export type LanTransferOutgoingMessage =
  | LanTransferHandshakeAckMessage
  | LanTransferPongMessage
  | LanTransferFileStartAckMessage
  | LanTransferFileCompleteMessage
  | LanTransferErrorMessage

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
  VERIFYING = 'verifying',
  COMPLETING = 'completing',
  COMPLETE = 'complete',
  ERROR = 'error',
  CANCELLED = 'cancelled'
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
  connectedClient?: LanTransferClientInfo
  lastError?: string
  fileTransfer?: FileTransferProgress
  completedFilePath?: string
  transferCancelled?: boolean
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

export interface LanTransferFileChunkMessage {
  type: 'file_chunk'
  transferId: string
  chunkIndex: number
  data: string // Base64 encoded
  chunkChecksum: string
}

export interface LanTransferFileEndMessage {
  type: 'file_end'
  transferId: string
}

export interface LanTransferFileCancelMessage {
  type: 'file_cancel'
  transferId: string
  reason?: string
}

// File transfer response messages (Mobile -> Electron)
export interface LanTransferFileStartAckMessage {
  type: 'file_start_ack'
  transferId: string
  accepted: boolean
  message?: string
}

// v3: LanTransferFileChunkAckMessage removed - streaming mode, no per-chunk ACK

export type LanTransferFileCompleteErrorCode = 'CHECKSUM_MISMATCH' | 'INCOMPLETE_TRANSFER' | 'DISK_ERROR' | 'CANCELLED'

export interface LanTransferFileCompleteMessage {
  type: 'file_complete'
  transferId: string
  success: boolean
  filePath?: string
  error?: string
  // v3 new fields
  errorCode?: LanTransferFileCompleteErrorCode
  receivedChunks?: number
  receivedBytes?: number
}

export type LanTransferIncomingMessage =
  | LanTransferHandshakeMessage
  | LanTransferPingMessage
  | LanTransferFileStartMessage
  | LanTransferFileChunkMessage
  | LanTransferFileEndMessage
  | LanTransferFileCancelMessage

// v3: LanTransferFileChunkAckMessage removed from union - streaming mode
export type LanTransferOutgoingMessage =
  | LanTransferHandshakeAckMessage
  | LanTransferPongMessage
  | LanTransferFileStartAckMessage
  | LanTransferFileCompleteMessage

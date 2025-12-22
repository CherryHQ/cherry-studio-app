import type {
  LanTransferFileChunkMessage,
  LanTransferFileEndMessage,
  LanTransferFileStartMessage,
  LanTransferIncomingMessage
} from '@/types/lanTransfer'

/**
 * Generic message validator
 * Validates that the message has the correct type and required fields
 */
const validateMessage = (msg: unknown, type: string, requiredFields: string[]): boolean => {
  if (!msg || typeof msg !== 'object') return false
  const m = msg as Record<string, unknown>
  if (m.type !== type) return false
  return requiredFields.every(field => field in m && m[field] !== undefined)
}

/**
 * Validates handshake message
 */
export const isValidHandshakeMessage = (
  msg: unknown
): msg is Extract<LanTransferIncomingMessage, { type: 'handshake' }> => {
  return validateMessage(msg, 'handshake', ['version', 'platform'])
}

/**
 * Validates ping message
 */
export const isValidPingMessage = (msg: unknown): msg is Extract<LanTransferIncomingMessage, { type: 'ping' }> => {
  return validateMessage(msg, 'ping', [])
}

/**
 * Validates file_start message
 */
export const isValidFileStartMessage = (msg: unknown): msg is LanTransferFileStartMessage => {
  if (
    !validateMessage(msg, 'file_start', [
      'transferId',
      'fileName',
      'fileSize',
      'mimeType',
      'checksum',
      'totalChunks',
      'chunkSize'
    ])
  ) {
    return false
  }

  const m = msg as Record<string, unknown>
  return (
    typeof m.transferId === 'string' &&
    typeof m.fileName === 'string' &&
    typeof m.fileSize === 'number' &&
    typeof m.mimeType === 'string' &&
    typeof m.checksum === 'string' &&
    typeof m.totalChunks === 'number' &&
    typeof m.chunkSize === 'number'
  )
}

/**
 * Validates file_chunk message (JSON mode only)
 * v1: Binary frame mode doesn't use this validator
 */
export const isValidFileChunkMessage = (msg: unknown): msg is LanTransferFileChunkMessage => {
  if (!validateMessage(msg, 'file_chunk', ['transferId', 'chunkIndex', 'data'])) {
    return false
  }

  const m = msg as Record<string, unknown>
  return typeof m.transferId === 'string' && typeof m.chunkIndex === 'number' && typeof m.data === 'string'
}

/**
 * Validates file_end message
 */
export const isValidFileEndMessage = (msg: unknown): msg is LanTransferFileEndMessage => {
  if (!validateMessage(msg, 'file_end', ['transferId'])) {
    return false
  }

  const m = msg as Record<string, unknown>
  return typeof m.transferId === 'string'
}

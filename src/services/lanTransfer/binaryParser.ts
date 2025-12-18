import { Buffer } from 'buffer'

import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('BinaryParser')

// Binary frame constants
const MAGIC_BYTE_1 = 0x43 // 'C'
const MAGIC_BYTE_2 = 0x53 // 'S'
const JSON_START_BYTE = 0x7b // '{'
const NEWLINE_BYTE = 0x0a // '\n' - message terminator
const FRAME_TYPE_FILE_CHUNK = 0x01

// Minimum header size: Magic(2) + TotalLen(4) + Type(1) + TidLen(2) + ChunkIdx(4) = 13
const MIN_BINARY_FRAME_SIZE = 13

// Helper functions to read integers using DataView (more reliable in React Native)
// React Native's buffer polyfill may lose methods like readUInt32BE after Buffer.concat()
const readUInt32BE = (buf: Buffer | Uint8Array, offset: number): number => {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0
}

const readUInt16BE = (buf: Buffer | Uint8Array, offset: number): number => {
  return (buf[offset] << 8) | buf[offset + 1]
}

export interface ParsedBinaryChunk {
  transferId: string
  chunkIndex: number
  data: Buffer
}

export interface BinaryParserResult {
  type: 'binary_chunk' | 'json' | 'incomplete' | 'skip'
  chunk?: ParsedBinaryChunk
  json?: string
  consumedBytes: number
}

/**
 * Checks if buffer starts with binary frame magic bytes
 */
export const isBinaryFrame = (buffer: Buffer): boolean => {
  return buffer.length >= 2 && buffer[0] === MAGIC_BYTE_1 && buffer[1] === MAGIC_BYTE_2
}

/**
 * Checks if buffer starts with JSON message
 */
export const isJsonMessage = (buffer: Buffer): boolean => {
  return buffer.length > 0 && buffer[0] === JSON_START_BYTE
}

/**
 * Parse binary frame from buffer
 * Frame format: Magic(2) + TotalLen(4, BE) + Type(1) + TidLen(2, BE) + Tid + ChunkIdx(4, BE) + Data
 */
export const parseBinaryFrame = (buffer: Buffer): BinaryParserResult => {
  // Check minimum size
  if (buffer.length < MIN_BINARY_FRAME_SIZE) {
    return { type: 'incomplete', consumedBytes: 0 }
  }

  // Verify magic bytes
  if (buffer[0] !== MAGIC_BYTE_1 || buffer[1] !== MAGIC_BYTE_2) {
    logger.warn('Invalid magic bytes in binary frame', {
      expected: `0x${MAGIC_BYTE_1.toString(16)} 0x${MAGIC_BYTE_2.toString(16)}`,
      received: `0x${buffer[0].toString(16)} 0x${buffer[1].toString(16)}`
    })
    return { type: 'skip', consumedBytes: 1 }
  }

  // Read total length (excludes Magic and TotalLen itself)
  // Use helper function instead of buffer.readUInt32BE (React Native polyfill issue)
  const totalLen = readUInt32BE(buffer, 2)
  const frameLen = 2 + 4 + totalLen // Magic + TotalLen + payload

  // Check if we have complete frame
  if (buffer.length < frameLen) {
    return { type: 'incomplete', consumedBytes: 0 }
  }

  // Parse frame header
  const type = buffer[6]
  const tidLen = readUInt16BE(buffer, 7)
  const headerLen = 2 + 4 + 1 + 2 + tidLen + 4 // magic + totalLen + type + tidLen + tid + chunkIdx

  // Validate header length
  if (frameLen < headerLen) {
    logger.warn('Malformed binary frame: frame too short for header', {
      frameLen,
      requiredHeaderLen: headerLen,
      tidLen
    })
    return { type: 'skip', consumedBytes: frameLen }
  }

  // Only handle file_chunk type
  if (type !== FRAME_TYPE_FILE_CHUNK) {
    logger.warn('Unknown binary frame type', {
      receivedType: type,
      expectedType: FRAME_TYPE_FILE_CHUNK,
      frameLen
    })
    return { type: 'skip', consumedBytes: frameLen }
  }

  // Extract transfer ID and chunk index
  // Use Buffer.from() to ensure proper toString() behavior in React Native
  const transferId = Buffer.from(buffer.subarray(9, 9 + tidLen)).toString('utf8')
  const chunkIndex = readUInt32BE(buffer, 9 + tidLen)

  // Extract data
  const dataStart = headerLen
  const dataLen = frameLen - headerLen

  if (dataLen < 0) {
    logger.warn('Malformed binary frame: negative data length', {
      frameLen,
      headerLen,
      dataLen
    })
    return { type: 'skip', consumedBytes: frameLen }
  }

  const data = buffer.subarray(dataStart, dataStart + dataLen)

  return {
    type: 'binary_chunk',
    chunk: { transferId, chunkIndex, data: Buffer.from(data) },
    consumedBytes: frameLen
  }
}

/**
 * Parse JSON message from buffer (terminated by newline)
 */
export const parseJsonMessage = (buffer: Buffer): BinaryParserResult => {
  // Use explicit byte value to avoid React Native buffer polyfill issues with string indexOf
  const terminatorIndex = buffer.indexOf(NEWLINE_BYTE)

  if (terminatorIndex === -1) {
    // Terminator not found, wait for more data
    return { type: 'incomplete', consumedBytes: 0 }
  }

  // Must wrap in Buffer.from() because subarray() returns Uint8Array view
  // which doesn't properly handle toString('utf8') in React Native polyfill
  const rawMessage = Buffer.from(buffer.subarray(0, terminatorIndex)).toString('utf8').trim()
  const consumedBytes = terminatorIndex + 1 // newline is always 1 byte

  if (rawMessage.length === 0) {
    return { type: 'skip', consumedBytes }
  }

  return {
    type: 'json',
    json: rawMessage,
    consumedBytes
  }
}

/**
 * Parse next message from buffer
 * Returns the parse result and number of bytes consumed
 */
export const parseNextMessage = (buffer: Buffer): BinaryParserResult => {
  if (buffer.length === 0) {
    return { type: 'incomplete', consumedBytes: 0 }
  }

  // Check for binary frame
  if (isBinaryFrame(buffer)) {
    return parseBinaryFrame(buffer)
  }

  // Check for JSON message
  if (isJsonMessage(buffer)) {
    return parseJsonMessage(buffer)
  }

  // Unknown data, skip 1 byte to try realignment
  logger.warn('Unknown data format, attempting realignment', {
    firstByte: `0x${buffer[0].toString(16)}`,
    bufferLength: buffer.length
  })
  return { type: 'skip', consumedBytes: 1 }
}

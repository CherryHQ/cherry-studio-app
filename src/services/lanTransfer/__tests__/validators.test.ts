import {
  isValidFileChunkMessage,
  isValidFileEndMessage,
  isValidFileStartMessage,
  isValidHandshakeMessage,
  isValidPingMessage
} from '../validators'

describe('validators', () => {
  // ==================== isValidHandshakeMessage ====================

  describe('isValidHandshakeMessage', () => {
    test('returns true for valid handshake with required fields', () => {
      const msg = {
        type: 'handshake',
        version: '1',
        platform: 'darwin'
      }
      expect(isValidHandshakeMessage(msg)).toBe(true)
    })

    test('returns true for valid handshake with all optional fields', () => {
      const msg = {
        type: 'handshake',
        version: '1',
        platform: 'darwin',
        deviceName: 'Test Device',
        appVersion: '1.0.0'
      }
      expect(isValidHandshakeMessage(msg)).toBe(true)
    })

    test('returns false when type is not handshake', () => {
      const msg = {
        type: 'ping',
        version: '1',
        platform: 'darwin'
      }
      expect(isValidHandshakeMessage(msg)).toBe(false)
    })

    test('returns false when version is missing', () => {
      const msg = {
        type: 'handshake',
        platform: 'darwin'
      }
      expect(isValidHandshakeMessage(msg)).toBe(false)
    })

    test('returns false when platform is missing', () => {
      const msg = {
        type: 'handshake',
        version: '1'
      }
      expect(isValidHandshakeMessage(msg)).toBe(false)
    })

    test('returns false for null', () => {
      expect(isValidHandshakeMessage(null)).toBe(false)
    })

    test('returns false for undefined', () => {
      expect(isValidHandshakeMessage(undefined)).toBe(false)
    })

    test('returns false for non-object', () => {
      expect(isValidHandshakeMessage('string')).toBe(false)
      expect(isValidHandshakeMessage(123)).toBe(false)
      expect(isValidHandshakeMessage([])).toBe(false)
    })

    test('returns false when version is undefined (not missing)', () => {
      const msg = {
        type: 'handshake',
        version: undefined,
        platform: 'darwin'
      }
      expect(isValidHandshakeMessage(msg)).toBe(false)
    })

    test('handles extra fields gracefully', () => {
      const msg = {
        type: 'handshake',
        version: '1',
        platform: 'darwin',
        extraField: 'should be ignored'
      }
      expect(isValidHandshakeMessage(msg)).toBe(true)
    })
  })

  // ==================== isValidPingMessage ====================

  describe('isValidPingMessage', () => {
    test('returns true for valid ping without payload', () => {
      const msg = { type: 'ping' }
      expect(isValidPingMessage(msg)).toBe(true)
    })

    test('returns true for valid ping with payload', () => {
      const msg = { type: 'ping', payload: 'test-payload' }
      expect(isValidPingMessage(msg)).toBe(true)
    })

    test('returns false when type is not ping', () => {
      const msg = { type: 'pong' }
      expect(isValidPingMessage(msg)).toBe(false)
    })

    test('returns false for null', () => {
      expect(isValidPingMessage(null)).toBe(false)
    })

    test('returns false for undefined', () => {
      expect(isValidPingMessage(undefined)).toBe(false)
    })

    test('returns false for empty object', () => {
      expect(isValidPingMessage({})).toBe(false)
    })
  })

  // ==================== isValidFileStartMessage ====================

  describe('isValidFileStartMessage', () => {
    const validFileStart = {
      type: 'file_start',
      transferId: 'tid-123',
      fileName: 'test.zip',
      fileSize: 1024000,
      mimeType: 'application/zip',
      checksum: 'abc123def456',
      totalChunks: 10,
      chunkSize: 102400
    }

    test('returns true for valid file_start with all required fields', () => {
      expect(isValidFileStartMessage(validFileStart)).toBe(true)
    })

    test('returns false when type is not file_start', () => {
      const msg = { ...validFileStart, type: 'file_end' }
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when transferId is missing', () => {
      const { transferId: _transferId, ...msg } = validFileStart
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when fileName is missing', () => {
      const { fileName: _fileName, ...msg } = validFileStart
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when fileSize is missing', () => {
      const { fileSize: _fileSize, ...msg } = validFileStart
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when mimeType is missing', () => {
      const { mimeType: _mimeType, ...msg } = validFileStart
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when checksum is missing', () => {
      const { checksum: _checksum, ...msg } = validFileStart
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when totalChunks is missing', () => {
      const { totalChunks: _totalChunks, ...msg } = validFileStart
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when chunkSize is missing', () => {
      const { chunkSize: _chunkSize, ...msg } = validFileStart
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when transferId is not string', () => {
      const msg = { ...validFileStart, transferId: 123 }
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when fileName is not string', () => {
      const msg = { ...validFileStart, fileName: 123 }
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when fileSize is not number', () => {
      const msg = { ...validFileStart, fileSize: '1024000' }
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when mimeType is not string', () => {
      const msg = { ...validFileStart, mimeType: 123 }
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when checksum is not string', () => {
      const msg = { ...validFileStart, checksum: 123 }
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when totalChunks is not number', () => {
      const msg = { ...validFileStart, totalChunks: '10' }
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false when chunkSize is not number', () => {
      const msg = { ...validFileStart, chunkSize: '102400' }
      expect(isValidFileStartMessage(msg)).toBe(false)
    })

    test('returns false for null', () => {
      expect(isValidFileStartMessage(null)).toBe(false)
    })

    test('returns false for undefined', () => {
      expect(isValidFileStartMessage(undefined)).toBe(false)
    })

    test('handles zero values correctly', () => {
      const msg = { ...validFileStart, fileSize: 0, totalChunks: 0 }
      expect(isValidFileStartMessage(msg)).toBe(true)
    })
  })

  // ==================== isValidFileChunkMessage ====================

  describe('isValidFileChunkMessage', () => {
    const validFileChunk = {
      type: 'file_chunk',
      transferId: 'tid-123',
      chunkIndex: 0,
      data: 'base64encodeddata=='
    }

    test('returns true for valid file_chunk', () => {
      expect(isValidFileChunkMessage(validFileChunk)).toBe(true)
    })

    test('returns false when type is not file_chunk', () => {
      const msg = { ...validFileChunk, type: 'file_end' }
      expect(isValidFileChunkMessage(msg)).toBe(false)
    })

    test('returns false when transferId is missing', () => {
      const { transferId: _transferId, ...msg } = validFileChunk
      expect(isValidFileChunkMessage(msg)).toBe(false)
    })

    test('returns false when chunkIndex is missing', () => {
      const { chunkIndex: _chunkIndex, ...msg } = validFileChunk
      expect(isValidFileChunkMessage(msg)).toBe(false)
    })

    test('returns false when data is missing', () => {
      const { data: _data, ...msg } = validFileChunk
      expect(isValidFileChunkMessage(msg)).toBe(false)
    })

    test('returns false when transferId is not string', () => {
      const msg = { ...validFileChunk, transferId: 123 }
      expect(isValidFileChunkMessage(msg)).toBe(false)
    })

    test('returns false when chunkIndex is not number', () => {
      const msg = { ...validFileChunk, chunkIndex: '0' }
      expect(isValidFileChunkMessage(msg)).toBe(false)
    })

    test('returns false when data is not string', () => {
      const msg = { ...validFileChunk, data: 123 }
      expect(isValidFileChunkMessage(msg)).toBe(false)
    })

    test('returns false for null', () => {
      expect(isValidFileChunkMessage(null)).toBe(false)
    })

    test('handles zero chunkIndex correctly', () => {
      const msg = { ...validFileChunk, chunkIndex: 0 }
      expect(isValidFileChunkMessage(msg)).toBe(true)
    })

    test('handles empty data string correctly', () => {
      const msg = { ...validFileChunk, data: '' }
      expect(isValidFileChunkMessage(msg)).toBe(true)
    })
  })

  // ==================== isValidFileEndMessage ====================

  describe('isValidFileEndMessage', () => {
    test('returns true for valid file_end', () => {
      const msg = { type: 'file_end', transferId: 'tid-123' }
      expect(isValidFileEndMessage(msg)).toBe(true)
    })

    test('returns false when type is not file_end', () => {
      const msg = { type: 'file_start', transferId: 'tid-123' }
      expect(isValidFileEndMessage(msg)).toBe(false)
    })

    test('returns false when transferId is missing', () => {
      const msg = { type: 'file_end' }
      expect(isValidFileEndMessage(msg)).toBe(false)
    })

    test('returns false when transferId is not string', () => {
      const msg = { type: 'file_end', transferId: 123 }
      expect(isValidFileEndMessage(msg)).toBe(false)
    })

    test('returns false for null', () => {
      expect(isValidFileEndMessage(null)).toBe(false)
    })

    test('returns false for undefined', () => {
      expect(isValidFileEndMessage(undefined)).toBe(false)
    })

    test('handles empty transferId string', () => {
      const msg = { type: 'file_end', transferId: '' }
      expect(isValidFileEndMessage(msg)).toBe(true)
    })
  })

  // ==================== Edge Cases ====================

  describe('edge cases across all validators', () => {
    test('all validators return false for array input', () => {
      const arrayInput: unknown[] = []
      expect(isValidHandshakeMessage(arrayInput)).toBe(false)
      expect(isValidPingMessage(arrayInput)).toBe(false)
      expect(isValidFileStartMessage(arrayInput)).toBe(false)
      expect(isValidFileChunkMessage(arrayInput)).toBe(false)
      expect(isValidFileEndMessage(arrayInput)).toBe(false)
    })

    test('all validators return false for function input', () => {
      const fnInput = () => {}
      expect(isValidHandshakeMessage(fnInput)).toBe(false)
      expect(isValidPingMessage(fnInput)).toBe(false)
      expect(isValidFileStartMessage(fnInput)).toBe(false)
      expect(isValidFileChunkMessage(fnInput)).toBe(false)
      expect(isValidFileEndMessage(fnInput)).toBe(false)
    })

    test('validators handle prototype pollution attempts', () => {
      const maliciousMsg = JSON.parse(
        '{"type":"handshake","version":"3.0","platform":"darwin","__proto__":{"admin":true}}'
      )
      // Should still validate normally
      expect(isValidHandshakeMessage(maliciousMsg)).toBe(true)
    })
  })
})

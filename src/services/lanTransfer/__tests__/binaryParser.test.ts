import { Buffer } from 'buffer'

import { isBinaryFrame, isJsonMessage, parseBinaryFrame, parseJsonMessage, parseNextMessage } from '../binaryParser'

describe('binaryParser', () => {
  // ==================== Helper Functions ====================

  describe('isBinaryFrame', () => {
    test('returns true for valid magic bytes (0x43 0x53)', () => {
      const buffer = Buffer.from([0x43, 0x53, 0x00, 0x00])
      expect(isBinaryFrame(buffer)).toBe(true)
    })

    test('returns false for JSON start byte', () => {
      const buffer = Buffer.from('{"type":"ping"}')
      expect(isBinaryFrame(buffer)).toBe(false)
    })

    test('returns false for buffer with only first magic byte', () => {
      const buffer = Buffer.from([0x43])
      expect(isBinaryFrame(buffer)).toBe(false)
    })

    test('returns false for empty buffer', () => {
      const buffer = Buffer.alloc(0)
      expect(isBinaryFrame(buffer)).toBe(false)
    })

    test('returns false for wrong second magic byte', () => {
      const buffer = Buffer.from([0x43, 0x00])
      expect(isBinaryFrame(buffer)).toBe(false)
    })
  })

  describe('isJsonMessage', () => {
    test('returns true for buffer starting with {', () => {
      const buffer = Buffer.from('{"type":"ping"}\n')
      expect(isJsonMessage(buffer)).toBe(true)
    })

    test('returns false for binary frame', () => {
      const buffer = Buffer.from([0x43, 0x53, 0x00])
      expect(isJsonMessage(buffer)).toBe(false)
    })

    test('returns false for empty buffer', () => {
      const buffer = Buffer.alloc(0)
      expect(isJsonMessage(buffer)).toBe(false)
    })

    test('returns false for buffer starting with other characters', () => {
      const buffer = Buffer.from('invalid json')
      expect(isJsonMessage(buffer)).toBe(false)
    })
  })

  // ==================== parseJsonMessage ====================

  describe('parseJsonMessage', () => {
    test('parses complete JSON message with newline terminator', () => {
      const buffer = Buffer.from('{"type":"ping"}\n')
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      expect(result.json).toBe('{"type":"ping"}')
      expect(result.consumedBytes).toBe(16) // including newline
    })

    test('returns incomplete for message without newline terminator', () => {
      const buffer = Buffer.from('{"type":"ping"}')
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('incomplete')
      expect(result.consumedBytes).toBe(0)
    })

    test('returns skip for empty message (just newline)', () => {
      const buffer = Buffer.from('\n')
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('skip')
      expect(result.consumedBytes).toBe(1)
    })

    test('handles message with Chinese characters', () => {
      const buffer = Buffer.from('{"deviceName":"我的设备"}\n')
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      expect(result.json).toBe('{"deviceName":"我的设备"}')
    })

    test('handles message with emoji', () => {
      const buffer = Buffer.from('{"name":"Test 🚀"}\n')
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      expect(result.json).toBe('{"name":"Test 🚀"}')
    })

    test('handles JSON with escaped newline character in string', () => {
      // JSON string containing escaped \n should not break parsing
      const jsonStr = '{"data":"line1\\nline2"}\n'
      const buffer = Buffer.from(jsonStr)
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      expect(result.json).toBe('{"data":"line1\\nline2"}')
      // Verify the escaped newline is preserved
      const parsed = JSON.parse(result.json!)
      expect(parsed.data).toBe('line1\nline2')
    })

    test('handles nested JSON objects', () => {
      const jsonStr = '{"outer":{"inner":{"value":123}}}\n'
      const buffer = Buffer.from(jsonStr)
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      expect(result.json).toBe('{"outer":{"inner":{"value":123}}}')
    })

    test('handles JSON arrays', () => {
      const jsonStr = '{"items":[1,2,3,"four"]}\n'
      const buffer = Buffer.from(jsonStr)
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      expect(result.json).toBe('{"items":[1,2,3,"four"]}')
    })

    test('returns only first message when multiple messages in buffer', () => {
      const buffer = Buffer.from('{"type":"ping"}\n{"type":"pong"}\n')
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      expect(result.json).toBe('{"type":"ping"}')
      expect(result.consumedBytes).toBe(16)
    })

    test('handles whitespace-only message before newline', () => {
      const buffer = Buffer.from('   \n')
      const result = parseJsonMessage(buffer)

      // After trim(), message becomes empty, should skip
      expect(result.type).toBe('skip')
      expect(result.consumedBytes).toBe(4)
    })

    test('trims whitespace from message', () => {
      const buffer = Buffer.from('  {"type":"ping"}  \n')
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      expect(result.json).toBe('{"type":"ping"}')
    })

    test('handles handshake message with all fields', () => {
      const handshake = {
        type: 'handshake',
        deviceName: 'Test Device',
        version: '1',
        platform: 'darwin',
        appVersion: '1.0.0'
      }
      const buffer = Buffer.from(JSON.stringify(handshake) + '\n')
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      const parsed = JSON.parse(result.json!)
      expect(parsed).toEqual(handshake)
    })

    test('handles file_start message with numeric fields', () => {
      const fileStart = {
        type: 'file_start',
        transferId: 'tid-123',
        fileName: 'test.zip',
        fileSize: 1024000,
        mimeType: 'application/zip',
        checksum: 'abc123',
        totalChunks: 10,
        chunkSize: 102400
      }
      const buffer = Buffer.from(JSON.stringify(fileStart) + '\n')
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      const parsed = JSON.parse(result.json!)
      expect(parsed.fileSize).toBe(1024000)
      expect(typeof parsed.fileSize).toBe('number')
    })
  })

  // ==================== parseBinaryFrame ====================

  describe('parseBinaryFrame', () => {
    const buildFrame = (transferId: string, chunkIndex: number, data: Buffer, type = 0x01) => {
      const tid = Buffer.from(transferId, 'utf8')
      const totalLen = 1 + 2 + tid.length + 4 + data.length
      const frame = Buffer.alloc(2 + 4 + totalLen)

      frame[0] = 0x43 // 'C'
      frame[1] = 0x53 // 'S'
      frame.writeUInt32BE(totalLen, 2)
      frame[6] = type
      frame.writeUInt16BE(tid.length, 7)
      tid.copy(frame, 9)
      frame.writeUInt32BE(chunkIndex, 9 + tid.length)
      data.copy(frame, 13 + tid.length)

      return frame
    }

    test('parses complete binary frame', () => {
      const data = Buffer.from([1, 2, 3, 4])
      const frame = buildFrame('tid-123', 0, data)
      const result = parseBinaryFrame(frame)

      expect(result.type).toBe('binary_chunk')
      expect(result.chunk).toBeDefined()
      expect(result.chunk!.transferId).toBe('tid-123')
      expect(result.chunk!.chunkIndex).toBe(0)
      expect(result.chunk!.data).toEqual(data)
    })

    test('returns incomplete for partial frame (header only)', () => {
      const frame = Buffer.from([0x43, 0x53, 0x00, 0x00, 0x00, 0x10]) // partial header
      const result = parseBinaryFrame(frame)

      expect(result.type).toBe('incomplete')
      expect(result.consumedBytes).toBe(0)
    })

    test('returns incomplete for frame smaller than minimum size', () => {
      const frame = Buffer.from([0x43, 0x53, 0x00])
      const result = parseBinaryFrame(frame)

      expect(result.type).toBe('incomplete')
      expect(result.consumedBytes).toBe(0)
    })

    test('returns skip for invalid magic bytes', () => {
      const frame = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
      const result = parseBinaryFrame(frame)

      expect(result.type).toBe('skip')
      expect(result.consumedBytes).toBe(1)
    })

    test('returns skip for unknown frame type', () => {
      const data = Buffer.from([0xaa])
      const frame = buildFrame('tid-123', 0, data, 0x02) // unknown type
      const result = parseBinaryFrame(frame)

      expect(result.type).toBe('skip')
      expect(result.consumedBytes).toBe(frame.length)
    })

    test('handles large chunk index', () => {
      const data = Buffer.from([1, 2, 3, 4])
      const frame = buildFrame('tid-123', 999999, data)
      const result = parseBinaryFrame(frame)

      expect(result.type).toBe('binary_chunk')
      expect(result.chunk!.chunkIndex).toBe(999999)
    })

    test('handles long transfer ID', () => {
      const longId = 'a'.repeat(100)
      const data = Buffer.from([1, 2, 3, 4])
      const frame = buildFrame(longId, 0, data)
      const result = parseBinaryFrame(frame)

      expect(result.type).toBe('binary_chunk')
      expect(result.chunk!.transferId).toBe(longId)
    })

    test('handles empty data payload', () => {
      const data = Buffer.alloc(0)
      const frame = buildFrame('tid-123', 0, data)
      const result = parseBinaryFrame(frame)

      expect(result.type).toBe('binary_chunk')
      expect(result.chunk!.data.length).toBe(0)
    })
  })

  // ==================== parseNextMessage ====================

  describe('parseNextMessage', () => {
    test('returns incomplete for empty buffer', () => {
      const buffer = Buffer.alloc(0)
      const result = parseNextMessage(buffer)

      expect(result.type).toBe('incomplete')
      expect(result.consumedBytes).toBe(0)
    })

    test('routes JSON message to parseJsonMessage', () => {
      const buffer = Buffer.from('{"type":"ping"}\n')
      const result = parseNextMessage(buffer)

      expect(result.type).toBe('json')
      expect(result.json).toBe('{"type":"ping"}')
    })

    test('routes binary frame to parseBinaryFrame', () => {
      const buildFrame = (transferId: string, chunkIndex: number, data: Buffer, type = 0x01) => {
        const tid = Buffer.from(transferId, 'utf8')
        const totalLen = 1 + 2 + tid.length + 4 + data.length
        const frame = Buffer.alloc(2 + 4 + totalLen)
        frame[0] = 0x43
        frame[1] = 0x53
        frame.writeUInt32BE(totalLen, 2)
        frame[6] = type
        frame.writeUInt16BE(tid.length, 7)
        tid.copy(frame, 9)
        frame.writeUInt32BE(chunkIndex, 9 + tid.length)
        data.copy(frame, 13 + tid.length)
        return frame
      }

      const data = Buffer.from([1, 2, 3, 4])
      const frame = buildFrame('tid-123', 0, data)
      const result = parseNextMessage(frame)

      expect(result.type).toBe('binary_chunk')
      expect(result.chunk).toBeDefined()
    })

    test('returns skip for unknown start byte', () => {
      const buffer = Buffer.from([0x00, 0x01, 0x02])
      const result = parseNextMessage(buffer)

      expect(result.type).toBe('skip')
      expect(result.consumedBytes).toBe(1)
    })

    test('handles buffer starting with random bytes before JSON', () => {
      // Simulate garbage data followed by valid JSON
      const buffer = Buffer.from([0x00, 0x00]) // unknown bytes
      const result = parseNextMessage(buffer)

      expect(result.type).toBe('skip')
      expect(result.consumedBytes).toBe(1)
    })
  })

  // ==================== Edge Cases for JSON Parsing Issues ====================

  describe('JSON parsing edge cases (related to malformed message errors)', () => {
    test('handles JSON with special characters that might cause parse errors', () => {
      // Test case: JSON with commas in strings
      const jsonStr = '{"message":"Hello, World!"}\n'
      const buffer = Buffer.from(jsonStr)
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      const parsed = JSON.parse(result.json!)
      expect(parsed.message).toBe('Hello, World!')
    })

    test('handles JSON with multiple commas in nested structure', () => {
      const jsonStr = '{"a":1,"b":2,"c":{"d":3,"e":4}}\n'
      const buffer = Buffer.from(jsonStr)
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      const parsed = JSON.parse(result.json!)
      expect(parsed.a).toBe(1)
      expect(parsed.c.e).toBe(4)
    })

    test('correctly handles buffer that looks like JSON but has binary prefix', () => {
      // Edge case: buffer starts with 'C' (0x43) which could be confused
      // But second byte is not 'S' (0x53)
      const buffer = Buffer.from('Corrupted{"type":"ping"}\n')
      const result = parseNextMessage(buffer)

      // Should skip byte by byte until it finds valid JSON
      expect(result.type).toBe('skip')
      expect(result.consumedBytes).toBe(1)
    })

    test('handles partial JSON followed by complete JSON', () => {
      // This tests the buffer accumulation scenario
      const partialJson = Buffer.from('{"type":"')
      const result1 = parseJsonMessage(partialJson)
      expect(result1.type).toBe('incomplete')

      // Now add rest of message
      const completeJson = Buffer.concat([partialJson, Buffer.from('ping"}\n')])
      const result2 = parseJsonMessage(completeJson)
      expect(result2.type).toBe('json')
      expect(result2.json).toBe('{"type":"ping"}')
    })

    test('handles JSON with unicode escape sequences', () => {
      const jsonStr = '{"text":"\\u0048\\u0065\\u006c\\u006c\\u006f"}\n'
      const buffer = Buffer.from(jsonStr)
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      const parsed = JSON.parse(result.json!)
      expect(parsed.text).toBe('Hello')
    })

    test('handles JSON with backslash escapes', () => {
      const jsonStr = '{"path":"C:\\\\Users\\\\test"}\n'
      const buffer = Buffer.from(jsonStr)
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      const parsed = JSON.parse(result.json!)
      expect(parsed.path).toBe('C:\\Users\\test')
    })

    test('handles JSON with quotes in strings', () => {
      const jsonStr = '{"text":"He said \\"Hello\\""}\n'
      const buffer = Buffer.from(jsonStr)
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      const parsed = JSON.parse(result.json!)
      expect(parsed.text).toBe('He said "Hello"')
    })

    test('handles very long JSON message', () => {
      const longValue = 'x'.repeat(10000)
      const jsonStr = `{"data":"${longValue}"}\n`
      const buffer = Buffer.from(jsonStr)
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      const parsed = JSON.parse(result.json!)
      expect(parsed.data.length).toBe(10000)
    })

    test('handles JSON with null and boolean values', () => {
      const jsonStr = '{"nullable":null,"enabled":true,"disabled":false}\n'
      const buffer = Buffer.from(jsonStr)
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      const parsed = JSON.parse(result.json!)
      expect(parsed.nullable).toBeNull()
      expect(parsed.enabled).toBe(true)
      expect(parsed.disabled).toBe(false)
    })

    test('handles JSON with numeric edge cases', () => {
      const jsonStr = '{"int":42,"float":3.14,"negative":-100,"zero":0}\n'
      const buffer = Buffer.from(jsonStr)
      const result = parseJsonMessage(buffer)

      expect(result.type).toBe('json')
      const parsed = JSON.parse(result.json!)
      expect(parsed.int).toBe(42)
      expect(parsed.float).toBe(3.14)
      expect(parsed.negative).toBe(-100)
      expect(parsed.zero).toBe(0)
    })
  })

  // ==================== Mixed Binary and JSON ====================

  describe('mixed binary and JSON processing', () => {
    const buildFrame = (transferId: string, chunkIndex: number, data: Buffer) => {
      const tid = Buffer.from(transferId, 'utf8')
      const totalLen = 1 + 2 + tid.length + 4 + data.length
      const frame = Buffer.alloc(2 + 4 + totalLen)
      frame[0] = 0x43
      frame[1] = 0x53
      frame.writeUInt32BE(totalLen, 2)
      frame[6] = 0x01
      frame.writeUInt16BE(tid.length, 7)
      tid.copy(frame, 9)
      frame.writeUInt32BE(chunkIndex, 9 + tid.length)
      data.copy(frame, 13 + tid.length)
      return frame
    }

    test('correctly identifies JSON after consuming binary frame', () => {
      const binaryData = Buffer.from([1, 2, 3, 4])
      const binaryFrame = buildFrame('tid-123', 0, binaryData)
      const jsonMessage = Buffer.from('{"type":"ping"}\n')
      const combined = Buffer.concat([binaryFrame, jsonMessage])

      // First parse: should get binary
      const result1 = parseNextMessage(combined)
      expect(result1.type).toBe('binary_chunk')

      // Parse remaining: should get JSON
      const remaining = combined.subarray(result1.consumedBytes)
      const result2 = parseNextMessage(remaining)
      expect(result2.type).toBe('json')
      expect(result2.json).toBe('{"type":"ping"}')
    })

    test('correctly identifies binary after consuming JSON message', () => {
      const jsonMessage = Buffer.from('{"type":"ping"}\n')
      const binaryData = Buffer.from([1, 2, 3, 4])
      const binaryFrame = buildFrame('tid-123', 0, binaryData)
      const combined = Buffer.concat([jsonMessage, binaryFrame])

      // First parse: should get JSON
      const result1 = parseNextMessage(combined)
      expect(result1.type).toBe('json')

      // Parse remaining: should get binary
      const remaining = combined.subarray(result1.consumedBytes)
      const result2 = parseNextMessage(remaining)
      expect(result2.type).toBe('binary_chunk')
    })
  })
})

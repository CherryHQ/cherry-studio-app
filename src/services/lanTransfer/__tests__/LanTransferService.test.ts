import { Buffer } from 'buffer'

import { FileTransferStatus, LanTransferServerStatus } from '@/types/lanTransfer'

import { lanTransferService } from '../LanTransferService'

// Mock storage constants before importing service to avoid accessing native Paths.cache
jest.mock('@/constants/storage', () => ({
  DEFAULT_STORAGE: { exists: true },
  DEFAULT_IMAGES_STORAGE: { exists: true },
  DEFAULT_DOCUMENTS_STORAGE: { exists: true },
  DEFAULT_ICONS_STORAGE: { exists: true },
  DEFAULT_LAN_TRANSFER_STORAGE: { exists: true, create: jest.fn(), uri: '/tmp/storage' },
  DEFAULT_LAN_TRANSFER_TEMP: { exists: true, create: jest.fn(), uri: '/tmp/temp' }
}))

const buildFrame = (transferId: string, chunkIndex: number, data: Buffer, type = 0x01) => {
  const tid = Buffer.from(transferId, 'utf8')
  const totalLen = 1 + 2 + tid.length + 4 + data.length // type + tidLen + tid + chunkIdx + data
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

const createService = () => {
  const service: any = new (lanTransferService as any).constructor()

  // v1: Stub side-effectful pieces (no sendChunkAck in v1 streaming mode)
  service.handleJsonMessage = jest.fn()

  // Provide a minimal transfer context
  const fileHandle = {
    offset: 0,
    writeBytes: jest.fn(),
    close: jest.fn()
  }

  const transferId = 'tid-123'
  service.state = {
    status: LanTransferServerStatus.RECEIVING_FILE,
    logs: []
  }
  service.currentTransfer = {
    transferId,
    fileName: 'demo.zip',
    fileSize: 8,
    expectedChecksum: '0'.repeat(64),
    totalChunks: 2,
    chunkSize: 4,
    receivedChunks: new Set<number>(),
    tempFilePath: '/tmp/demo',
    fileHandle,
    bytesReceived: 0,
    startTime: Date.now(),
    lastChunkTime: Date.now(),
    status: FileTransferStatus.RECEIVING,
    // Memory buffer fields for batched writes
    pendingChunks: new Map<number, Uint8Array>(),
    pendingBytesSize: 0,
    flushScheduled: false
  }

  return { service, fileHandle }
}

describe('LanTransferService binary protocol (v1)', () => {
  test('handles a complete binary frame', () => {
    const { service } = createService()
    const data = Buffer.from([1, 2, 3, 4])
    const frame = buildFrame('tid-123', 0, data)

    service.handleSocketData(frame)

    // v1: Data is buffered in memory, not written immediately to disk
    expect(service.currentTransfer.pendingChunks.has(0)).toBe(true)
    expect(service.currentTransfer.pendingChunks.get(0)).toEqual(new Uint8Array(data))
    // v1: No ACK sent in streaming mode
    expect(service.currentTransfer.receivedChunks.has(0)).toBe(true)
    expect(service.currentTransfer.bytesReceived).toBe(data.length)
  })

  test('buffers partial frame and processes when complete', () => {
    const { service } = createService()
    const data = Buffer.from([9, 8, 7, 6])
    const frame = buildFrame('tid-123', 1, data)

    // Send first half (incomplete)
    service.handleSocketData(frame.subarray(0, 5))
    expect(service.currentTransfer.pendingChunks.size).toBe(0)

    // Send remainder to complete the frame
    service.handleSocketData(frame.subarray(5))
    // v1: Data is buffered in memory, not written immediately to disk
    expect(service.currentTransfer.pendingChunks.has(1)).toBe(true)
    expect(service.currentTransfer.pendingChunks.get(1)).toEqual(new Uint8Array(data))
  })

  test('skips unknown binary frame type', () => {
    const { service } = createService()
    const data = Buffer.from([0xaa])
    const frame = buildFrame('tid-123', 0, data, 0x02)

    service.handleSocketData(frame)

    // Unknown frame type should not be buffered
    expect(service.currentTransfer.pendingChunks.size).toBe(0)
  })

  test('processes JSON messages alongside binary', () => {
    const { service } = createService()
    const json = Buffer.from('{"type":"ping"}\n')

    service.handleSocketData(json)

    expect(service.handleJsonMessage).toHaveBeenCalledWith('{"type":"ping"}')
  })

  test('handles duplicate chunk without rewriting (v1 streaming mode)', () => {
    const { service } = createService()
    const data = Buffer.from([1, 1, 1, 1])

    // First chunk write
    const frame1 = buildFrame('tid-123', 0, data)
    service.handleSocketData(frame1)

    const initialPendingSize = service.currentTransfer.pendingBytesSize

    // Duplicate chunk - should be ignored
    const frame2 = buildFrame('tid-123', 0, data)
    service.handleSocketData(frame2)

    // Only buffered once - pendingBytesSize should not increase
    expect(service.currentTransfer.pendingBytesSize).toBe(initialPendingSize)
    expect(service.currentTransfer.pendingChunks.size).toBe(1)
  })
})

// Helper to create service without mocking handleJsonMessage
const createServiceForJsonTests = () => {
  const service: any = new (lanTransferService as any).constructor()

  // Mock sendJsonMessage to capture sent messages
  const sentMessages: any[] = []
  service.sendJsonMessage = jest.fn((msg: any) => sentMessages.push(msg))

  // Mock cleanupClient
  service.cleanupClient = jest.fn()

  // Set initial state
  service.state = {
    status: LanTransferServerStatus.HANDSHAKING
  }
  service.binaryBuffer = Buffer.alloc(0)

  return { service, sentMessages }
}

describe('LanTransferService JSON message handling', () => {
  test('parses and routes valid handshake message', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    const handshake = {
      type: 'handshake',
      deviceName: 'Test Device',
      version: '1',
      platform: 'darwin'
    }
    const json = Buffer.from(JSON.stringify(handshake) + '\n')

    service.handleSocketData(json)

    // Should send handshake_ack
    expect(sentMessages.length).toBe(1)
    expect(sentMessages[0].type).toBe('handshake_ack')
    expect(sentMessages[0].accepted).toBe(true)
  })

  test('rejects handshake with wrong protocol version', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    const handshake = {
      type: 'handshake',
      deviceName: 'Test Device',
      version: '1.0', // wrong version
      platform: 'darwin'
    }
    const json = Buffer.from(JSON.stringify(handshake) + '\n')

    service.handleSocketData(json)

    expect(sentMessages.length).toBe(1)
    expect(sentMessages[0].type).toBe('handshake_ack')
    expect(sentMessages[0].accepted).toBe(false)
    expect(sentMessages[0].message).toContain('Protocol mismatch')
  })

  test('handles malformed JSON without crashing', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    const malformedJson = Buffer.from('{"type": "handshake", invalid json\n')

    // Should not throw
    expect(() => service.handleSocketData(malformedJson)).not.toThrow()

    // Error message sent to notify sender of parse error
    expect(sentMessages.length).toBe(1)
    expect(sentMessages[0].type).toBe('error')
    expect(sentMessages[0].errorCode).toBe('PARSE_ERROR')
  })

  test('ignores unknown message type', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    const unknownMsg = Buffer.from('{"type":"unknown_type","data":"test"}\n')

    service.handleSocketData(unknownMsg)

    // No response for unknown type
    expect(sentMessages.length).toBe(0)
  })

  test('ignores message that fails validation', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    // handshake without required 'version' field
    const invalidHandshake = Buffer.from('{"type":"handshake","platform":"darwin"}\n')

    service.handleSocketData(invalidHandshake)

    // No response for invalid message
    expect(sentMessages.length).toBe(0)
  })

  test('handles multiple JSON messages in single buffer', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    service.state.status = LanTransferServerStatus.CONNECTED

    const msg1 = '{"type":"ping"}\n'
    const msg2 = '{"type":"ping","payload":"test"}\n'
    const combined = Buffer.from(msg1 + msg2)

    service.handleSocketData(combined)

    // Both pong responses should be sent
    expect(sentMessages.length).toBe(2)
    expect(sentMessages[0].type).toBe('pong')
    expect(sentMessages[1].type).toBe('pong')
    expect(sentMessages[1].payload).toBe('test')
  })

  test('handles ping message when connected', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    service.state.status = LanTransferServerStatus.CONNECTED

    const ping = Buffer.from('{"type":"ping","payload":"hello"}\n')
    service.handleSocketData(ping)

    expect(sentMessages.length).toBe(1)
    expect(sentMessages[0]).toEqual({
      type: 'pong',
      received: true,
      payload: 'hello'
    })
  })

  test('ignores ping message when not connected', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    service.state.status = LanTransferServerStatus.HANDSHAKING

    const ping = Buffer.from('{"type":"ping"}\n')
    service.handleSocketData(ping)

    // No pong response when not connected
    expect(sentMessages.length).toBe(0)
  })

  test('handles JSON with Chinese characters', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    const handshake = {
      type: 'handshake',
      deviceName: '我的MacBook Pro',
      version: '1',
      platform: 'darwin'
    }
    const json = Buffer.from(JSON.stringify(handshake) + '\n')

    service.handleSocketData(json)

    expect(sentMessages.length).toBe(1)
    expect(sentMessages[0].accepted).toBe(true)
    expect(service.state.connectedClient.deviceName).toBe('我的MacBook Pro')
  })

  test('handles JSON with escaped characters', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    const handshake = {
      type: 'handshake',
      deviceName: 'Device "Pro" with\\backslash',
      version: '1',
      platform: 'darwin'
    }
    const json = Buffer.from(JSON.stringify(handshake) + '\n')

    service.handleSocketData(json)

    expect(sentMessages.length).toBe(1)
    expect(sentMessages[0].accepted).toBe(true)
    expect(service.state.connectedClient.deviceName).toBe('Device "Pro" with\\backslash')
  })

  test('buffers incomplete JSON and processes when complete', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    const handshake = {
      type: 'handshake',
      deviceName: 'Test Device',
      version: '1',
      platform: 'darwin'
    }
    const fullJson = JSON.stringify(handshake) + '\n'

    // Send first half
    service.handleSocketData(Buffer.from(fullJson.slice(0, 20)))
    expect(sentMessages.length).toBe(0)

    // Send second half
    service.handleSocketData(Buffer.from(fullJson.slice(20)))
    expect(sentMessages.length).toBe(1)
    expect(sentMessages[0].accepted).toBe(true)
  })

  test('handles JSON message followed by binary frame', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    service.state.status = LanTransferServerStatus.CONNECTED

    const pingJson = Buffer.from('{"type":"ping"}\n')
    const binaryFrame = buildFrame('tid-123', 0, Buffer.from([1, 2, 3, 4]))
    const combined = Buffer.concat([pingJson, binaryFrame])

    // Note: Binary frame won't be processed correctly without currentTransfer
    // but this test verifies JSON is processed first
    service.handleSocketData(combined)

    expect(sentMessages.length).toBe(1)
    expect(sentMessages[0].type).toBe('pong')
  })

  test('handles empty JSON object gracefully', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    const emptyObj = Buffer.from('{}\n')

    // Should not throw
    expect(() => service.handleSocketData(emptyObj)).not.toThrow()

    // No response for object without type
    expect(sentMessages.length).toBe(0)
  })

  test('handles JSON array (invalid message format) gracefully', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    const jsonArray = Buffer.from('[1, 2, 3]\n')

    // Should not throw
    expect(() => service.handleSocketData(jsonArray)).not.toThrow()

    // No response for array
    expect(sentMessages.length).toBe(0)
  })

  test('handles whitespace before JSON', () => {
    const { service, sentMessages } = createServiceForJsonTests()
    // Whitespace before { means isJsonMessage will return false
    // and parseNextMessage will skip byte by byte
    const wsJson = Buffer.from('  {"type":"ping"}\n')

    service.handleSocketData(wsJson)

    // After skipping whitespace bytes, should eventually parse the JSON
    // But since whitespace bytes are not '{', they get skipped one by one
    // This tests the skip behavior
    expect(sentMessages.length).toBe(0) // Won't parse because leading spaces
  })
})

describe('LanTransferService mixed protocol handling', () => {
  test('correctly processes binary frame followed by JSON messages', () => {
    const service: any = new (lanTransferService as any).constructor()

    service.state = {
      status: LanTransferServerStatus.RECEIVING_FILE
    }

    const fileHandle = {
      offset: 0,
      writeBytes: jest.fn(),
      close: jest.fn()
    }

    service.currentTransfer = {
      transferId: 'tid-123',
      fileName: 'demo.zip',
      fileSize: 8,
      expectedChecksum: '0'.repeat(64),
      totalChunks: 2,
      chunkSize: 4,
      receivedChunks: new Set<number>(),
      tempFilePath: '/tmp/demo',
      fileHandle,
      bytesReceived: 0,
      startTime: Date.now(),
      lastChunkTime: Date.now(),
      status: FileTransferStatus.RECEIVING,
      // Memory buffer fields for batched writes
      pendingChunks: new Map<number, Uint8Array>(),
      pendingBytesSize: 0,
      flushScheduled: false
    }

    service.binaryBuffer = Buffer.alloc(0)

    // Binary frame followed by an unknown JSON message (won't trigger completion flow)
    const binaryFrame = buildFrame('tid-123', 0, Buffer.from([1, 2, 3, 4]))
    const jsonMsg = Buffer.from('{"type":"unknown_test_type"}\n')
    const combined = Buffer.concat([binaryFrame, jsonMsg])

    service.handleSocketData(combined)

    // Binary frame should be buffered in memory
    expect(service.currentTransfer.pendingChunks.has(0)).toBe(true)
    expect(service.currentTransfer.pendingChunks.get(0)).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(service.currentTransfer.receivedChunks.has(0)).toBe(true)
    expect(service.currentTransfer.bytesReceived).toBe(4)
  })
})

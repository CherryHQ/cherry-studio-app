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

  // Stub side-effectful pieces
  service.sendChunkAck = jest.fn()
  service.resetChunkTimeout = jest.fn()
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
    startTime: 0,
    lastChunkTime: 0,
    status: FileTransferStatus.RECEIVING
  }

  return { service, fileHandle }
}

describe('LanTransferService binary protocol', () => {
  test('handles a complete binary frame', () => {
    const { service, fileHandle } = createService()
    const data = Buffer.from([1, 2, 3, 4])
    const frame = buildFrame('tid-123', 0, data)

    service.handleSocketData(frame)

    expect(fileHandle.writeBytes).toHaveBeenCalledWith(new Uint8Array(data))
    expect(service.sendChunkAck).toHaveBeenCalledWith('tid-123', 0, true)
    expect(service.currentTransfer.receivedChunks.has(0)).toBe(true)
    expect(service.currentTransfer.bytesReceived).toBe(data.length)
  })

  test('buffers partial frame and processes when complete', () => {
    const { service, fileHandle } = createService()
    const data = Buffer.from([9, 8, 7, 6])
    const frame = buildFrame('tid-123', 1, data)

    // Send first half (incomplete)
    service.handleSocketData(frame.subarray(0, 5))
    expect(fileHandle.writeBytes).not.toHaveBeenCalled()

    // Send remainder to complete the frame
    service.handleSocketData(frame.subarray(5))
    expect(fileHandle.writeBytes).toHaveBeenCalledTimes(1)
    expect(service.sendChunkAck).toHaveBeenCalledWith('tid-123', 1, true)
  })

  test('skips unknown binary frame type', () => {
    const { service, fileHandle } = createService()
    const data = Buffer.from([0xaa])
    const frame = buildFrame('tid-123', 0, data, 0x02)

    service.handleSocketData(frame)

    expect(fileHandle.writeBytes).not.toHaveBeenCalled()
    expect(service.sendChunkAck).not.toHaveBeenCalled()
  })

  test('processes JSON messages alongside binary', () => {
    const { service } = createService()
    const json = Buffer.from('{"type":"ping"}\n')

    service.handleSocketData(json)

    expect(service.handleJsonMessage).toHaveBeenCalledWith('{"type":"ping"}')
  })

  test('handles duplicate chunk by ack without rewriting', () => {
    const { service, fileHandle } = createService()
    const data = Buffer.from([1, 1, 1, 1])

    service.handleBinaryFileChunk('tid-123', 0, data)
    service.handleBinaryFileChunk('tid-123', 0, data)

    expect(fileHandle.writeBytes).toHaveBeenCalledTimes(1)
    expect(service.sendChunkAck).toHaveBeenCalledTimes(2)
    expect(service.sendChunkAck).toHaveBeenLastCalledWith('tid-123', 0, true)
  })
})

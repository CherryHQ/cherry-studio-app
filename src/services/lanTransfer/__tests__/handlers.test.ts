import { LAN_TRANSFER_PROTOCOL_VERSION } from '@/constants/lanTransfer'
import type { LanTransferOutgoingMessage } from '@/types/lanTransfer'
import { LanTransferServerStatus } from '@/types/lanTransfer'

import { handleHandshake, handlePing } from '../handlers'

// Mock storage constants before importing handlers to avoid accessing native Paths.cache
jest.mock('@/constants/storage', () => ({
  DEFAULT_STORAGE: { exists: true },
  DEFAULT_IMAGES_STORAGE: { exists: true },
  DEFAULT_DOCUMENTS_STORAGE: { exists: true },
  DEFAULT_ICONS_STORAGE: { exists: true },
  DEFAULT_LAN_TRANSFER_STORAGE: { exists: true, create: jest.fn(), uri: '/tmp/storage' },
  DEFAULT_LAN_TRANSFER_TEMP: { exists: true, create: jest.fn(), uri: '/tmp/temp' }
}))

describe('handlers', () => {
  // ==================== handleHandshake ====================

  describe('handleHandshake', () => {
    const createMockContext = () => {
      const sentMessages: LanTransferOutgoingMessage[] = []
      const stateUpdates: { status?: LanTransferServerStatus; connectedClient?: unknown }[] = []
      let cleanupCalled = false

      return {
        sendJsonMessage: jest.fn((msg: LanTransferOutgoingMessage) => sentMessages.push(msg)),
        updateState: jest.fn((partial: { status?: LanTransferServerStatus; connectedClient?: unknown }) =>
          stateUpdates.push(partial)
        ),
        cleanupClient: jest.fn(() => {
          cleanupCalled = true
        }),
        getSentMessages: () => sentMessages,
        getStateUpdates: () => stateUpdates,
        wasCleanupCalled: () => cleanupCalled
      }
    }

    test('accepts handshake with matching protocol version', () => {
      const context = createMockContext()
      const message = {
        type: 'handshake' as const,
        deviceName: 'Test Device',
        version: LAN_TRANSFER_PROTOCOL_VERSION,
        platform: 'darwin',
        appVersion: '1.0.0'
      }

      handleHandshake(message, context)

      expect(context.sendJsonMessage).toHaveBeenCalledWith({
        type: 'handshake_ack',
        accepted: true
      })
      expect(context.updateState).toHaveBeenCalledWith({
        status: LanTransferServerStatus.CONNECTED,
        connectedClient: {
          deviceName: 'Test Device',
          platform: 'darwin',
          version: LAN_TRANSFER_PROTOCOL_VERSION,
          appVersion: '1.0.0'
        }
      })
      expect(context.cleanupClient).not.toHaveBeenCalled()
    })

    test('rejects handshake with mismatched protocol version', () => {
      const context = createMockContext()
      const message = {
        type: 'handshake' as const,
        deviceName: 'Test Device',
        version: '1.0', // wrong version
        platform: 'darwin'
      }

      handleHandshake(message, context)

      expect(context.sendJsonMessage).toHaveBeenCalledWith({
        type: 'handshake_ack',
        accepted: false,
        message: expect.stringContaining('Protocol mismatch')
      })
      expect(context.cleanupClient).toHaveBeenCalled()
      expect(context.updateState).not.toHaveBeenCalled()
    })

    test('uses "Unknown Device" when deviceName is not provided', () => {
      const context = createMockContext()
      const message = {
        type: 'handshake' as const,
        version: LAN_TRANSFER_PROTOCOL_VERSION,
        platform: 'darwin'
      } as any // deviceName is optional in the type

      handleHandshake(message, context)

      const stateUpdate = context.getStateUpdates()[0]
      expect(stateUpdate.connectedClient).toEqual(
        expect.objectContaining({
          deviceName: 'Unknown Device'
        })
      )
    })

    test('extracts all client info fields', () => {
      const context = createMockContext()
      const message = {
        type: 'handshake' as const,
        deviceName: 'MacBook Pro',
        version: LAN_TRANSFER_PROTOCOL_VERSION,
        platform: 'darwin',
        appVersion: '2.5.0'
      }

      handleHandshake(message, context)

      const stateUpdate = context.getStateUpdates()[0]
      expect(stateUpdate.connectedClient).toEqual({
        deviceName: 'MacBook Pro',
        platform: 'darwin',
        version: LAN_TRANSFER_PROTOCOL_VERSION,
        appVersion: '2.5.0'
      })
    })

    test('handles undefined optional fields', () => {
      const context = createMockContext()
      const message = {
        type: 'handshake' as const,
        deviceName: 'Test Device',
        version: LAN_TRANSFER_PROTOCOL_VERSION,
        platform: 'win32'
        // appVersion is undefined
      }

      handleHandshake(message, context)

      const stateUpdate = context.getStateUpdates()[0]
      expect(stateUpdate.connectedClient).toEqual({
        deviceName: 'Test Device',
        platform: 'win32',
        version: LAN_TRANSFER_PROTOCOL_VERSION,
        appVersion: undefined
      })
    })

    test('error message includes expected and received versions', () => {
      const context = createMockContext()
      const wrongVersion = '2.0'
      const message = {
        type: 'handshake' as const,
        deviceName: 'Test Device',
        version: wrongVersion,
        platform: 'darwin'
      }

      handleHandshake(message, context)

      const sentMessage = context.getSentMessages()[0] as any
      expect(sentMessage.message).toContain(LAN_TRANSFER_PROTOCOL_VERSION)
      expect(sentMessage.message).toContain(wrongVersion)
    })
  })

  // ==================== handlePing ====================

  describe('handlePing', () => {
    const createMockContext = (status: LanTransferServerStatus) => {
      const sentMessages: LanTransferOutgoingMessage[] = []

      return {
        sendJsonMessage: jest.fn((msg: LanTransferOutgoingMessage) => sentMessages.push(msg)),
        getStatus: jest.fn(() => status),
        getSentMessages: () => sentMessages
      }
    }

    test('responds with pong when status is CONNECTED', () => {
      const context = createMockContext(LanTransferServerStatus.CONNECTED)
      const message = {
        type: 'ping' as const
      }

      handlePing(message, context)

      expect(context.sendJsonMessage).toHaveBeenCalledWith({
        type: 'pong',
        received: true,
        payload: undefined
      })
    })

    test('echoes back the payload in pong response', () => {
      const context = createMockContext(LanTransferServerStatus.CONNECTED)
      const message = {
        type: 'ping' as const,
        payload: 'test-payload-123'
      }

      handlePing(message, context)

      expect(context.sendJsonMessage).toHaveBeenCalledWith({
        type: 'pong',
        received: true,
        payload: 'test-payload-123'
      })
    })

    test('does not respond when status is IDLE', () => {
      const context = createMockContext(LanTransferServerStatus.IDLE)
      const message = { type: 'ping' as const }

      handlePing(message, context)

      expect(context.sendJsonMessage).not.toHaveBeenCalled()
    })

    test('does not respond when status is LISTENING', () => {
      const context = createMockContext(LanTransferServerStatus.LISTENING)
      const message = { type: 'ping' as const }

      handlePing(message, context)

      expect(context.sendJsonMessage).not.toHaveBeenCalled()
    })

    test('does not respond when status is HANDSHAKING', () => {
      const context = createMockContext(LanTransferServerStatus.HANDSHAKING)
      const message = { type: 'ping' as const }

      handlePing(message, context)

      expect(context.sendJsonMessage).not.toHaveBeenCalled()
    })

    test('does not respond when status is RECEIVING_FILE', () => {
      const context = createMockContext(LanTransferServerStatus.RECEIVING_FILE)
      const message = { type: 'ping' as const }

      handlePing(message, context)

      expect(context.sendJsonMessage).not.toHaveBeenCalled()
    })

    test('does not respond when status is ERROR', () => {
      const context = createMockContext(LanTransferServerStatus.ERROR)
      const message = { type: 'ping' as const }

      handlePing(message, context)

      expect(context.sendJsonMessage).not.toHaveBeenCalled()
    })

    test('handles empty payload', () => {
      const context = createMockContext(LanTransferServerStatus.CONNECTED)
      const message = {
        type: 'ping' as const,
        payload: ''
      }

      handlePing(message, context)

      expect(context.sendJsonMessage).toHaveBeenCalledWith({
        type: 'pong',
        received: true,
        payload: ''
      })
    })
  })
})

import { LAN_TRANSFER_PROTOCOL_VERSION } from '@/constants/lanTransfer'
import type { LanTransferClientInfo, LanTransferIncomingMessage, LanTransferOutgoingMessage } from '@/types/lanTransfer'
import { LanTransferServerStatus } from '@/types/lanTransfer'

interface HandshakeContext {
  sendJsonMessage: (payload: LanTransferOutgoingMessage) => void
  updateState: (partial: { status?: LanTransferServerStatus; connectedClient?: LanTransferClientInfo }) => void
  cleanupClient: () => void
}

/**
 * Handle handshake message from client
 */
export const handleHandshake = (
  message: Extract<LanTransferIncomingMessage, { type: 'handshake' }>,
  context: HandshakeContext
): void => {
  const clientInfo: LanTransferClientInfo = {
    deviceName: message.deviceName || 'Unknown Device',
    platform: message.platform,
    version: message.version,
    appVersion: message.appVersion
  }

  // Check protocol version
  if (message.version !== LAN_TRANSFER_PROTOCOL_VERSION) {
    const errorMessage = `Protocol mismatch: expected ${LAN_TRANSFER_PROTOCOL_VERSION}, received ${message.version}`
    context.sendJsonMessage({
      type: 'handshake_ack',
      accepted: false,
      message: errorMessage
    })
    context.cleanupClient()
    return
  }

  // Accept handshake
  context.sendJsonMessage({
    type: 'handshake_ack',
    accepted: true
  })
  context.updateState({
    status: LanTransferServerStatus.CONNECTED,
    connectedClient: clientInfo
  })
}

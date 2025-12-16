import type { LanTransferIncomingMessage, LanTransferOutgoingMessage } from '@/types/lanTransfer'
import { LanTransferServerStatus } from '@/types/lanTransfer'

interface PingContext {
  sendJsonMessage: (payload: LanTransferOutgoingMessage) => void
  getStatus: () => LanTransferServerStatus
}

/**
 * Handle ping message from client
 */
export const handlePing = (
  message: Extract<LanTransferIncomingMessage, { type: 'ping' }>,
  context: PingContext
): void => {
  // Only respond to ping when connected
  if (context.getStatus() !== LanTransferServerStatus.CONNECTED) {
    return
  }

  context.sendJsonMessage({
    type: 'pong',
    received: true,
    payload: message.payload
  })
}

import { useCallback, useSyncExternalStore } from 'react'

import { lanTransferService } from '@/services/lanTransfer'
import { LanTransferServerStatus } from '@/types/lanTransfer'

export function useLanTransfer() {
  // ==================== Subscription (useSyncExternalStore) ====================

  const subscribe = useCallback((callback: () => void) => {
    return lanTransferService.subscribe(callback)
  }, [])

  const getSnapshot = useCallback(() => {
    return lanTransferService.getState()
  }, [])

  const getServerSnapshot = useCallback(() => {
    return lanTransferService.getState()
  }, [])

  // Use useSyncExternalStore for reactive updates
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // ==================== Computed Properties ====================

  const isServerRunning =
    state.status === LanTransferServerStatus.LISTENING ||
    state.status === LanTransferServerStatus.HANDSHAKING ||
    state.status === LanTransferServerStatus.CONNECTED ||
    state.status === LanTransferServerStatus.RECEIVING_FILE ||
    state.status === LanTransferServerStatus.STARTING

  const isReceivingFile = state.status === LanTransferServerStatus.RECEIVING_FILE

  return {
    ...state,
    isServerRunning,
    isReceivingFile,
    startServer: lanTransferService.startServer,
    stopServer: lanTransferService.stopServer,
    clearCompletedFile: lanTransferService.clearCompletedFile
  }
}

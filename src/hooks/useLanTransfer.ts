import { useEffect, useState } from 'react'

import { lanTransferService } from '@/services/LanTransferService'
import { LanTransferServerStatus, type LanTransferState } from '@/types/lanTransfer'

export function useLanTransfer() {
  const [state, setState] = useState<LanTransferState>(lanTransferService.getState())

  useEffect(() => {
    const unsubscribe = lanTransferService.subscribe(nextState => {
      setState(nextState)
    })

    return unsubscribe
  }, [])

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
    clearLogs: lanTransferService.clearLogs,
    clearCompletedFile: lanTransferService.clearCompletedFile
  }
}

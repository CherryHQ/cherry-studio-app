import { useEffect, useState } from 'react'

import { uuid } from '@/utils'

import type { DialogProps, DialogState, DialogType } from './types'

// Default state
const defaultDialogState: DialogState = {
  type: 'info',
  isOpen: false,
  isLoading: false,
  title: '',
  content: ''
}

// Global state
let currentDialogState: DialogState = { ...defaultDialogState }
let updateCallback: ((state: DialogState) => void) | null = null
let currentDialogId: string | null = null

// Internal: update loading state
function setLoading(loading: boolean) {
  currentDialogState = { ...currentDialogState, isLoading: loading }
  updateCallback?.(currentDialogState)
}

/**
 * Present a dialog with the specified type and props
 * @param type - Dialog type: 'info' | 'error' | 'warning' | 'success'
 * @param props - Dialog props
 */
export function presentDialog(type: DialogType, props: DialogProps) {
  currentDialogId = uuid()
  currentDialogState = {
    ...props,
    type,
    isOpen: true,
    isLoading: false
  }
  updateCallback?.(currentDialogState)
}

/**
 * Dismiss the current dialog
 */
export function dismissDialog() {
  currentDialogState = { ...currentDialogState, isOpen: false }
  updateCallback?.(currentDialogState)
}

/**
 * Internal hook for DialogManager component
 * Manages global dialog state and handles confirm with auto-loading
 */
export function useDialogManagerState() {
  const [state, setState] = useState<DialogState>(currentDialogState)

  useEffect(() => {
    updateCallback = setState
    return () => {
      updateCallback = null
    }
  }, [])

  // Handle confirm with auto-loading management
  const handleConfirm = async () => {
    const dialogIdBeforeConfirm = currentDialogId
    const { onConfirm } = state
    if (onConfirm) {
      setLoading(true)
      try {
        await onConfirm()
      } finally {
        setLoading(false)
      }
    }
    // Only dismiss if no new dialog was opened during onConfirm
    if (currentDialogId === dialogIdBeforeConfirm) {
      dismissDialog()
    }
  }

  // Handle cancel
  const handleCancel = () => {
    state.onCancel?.()
    dismissDialog()
  }

  // Handle open change (for overlay dismiss)
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      dismissDialog()
    }
  }

  return {
    state,
    handleConfirm,
    handleCancel,
    handleOpenChange
  }
}

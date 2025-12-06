import React from 'react'

import { UnifiedDialog } from './UnifiedDialog'
import { useDialogManagerState } from './useDialogManager'

/**
 * DialogManager - Global dialog manager component
 *
 * This component should be registered at the app root level (in App.tsx).
 * It manages a single dialog instance that can be controlled via:
 * - presentDialog(type, props) - Show dialog
 * - dismissDialog() - Hide dialog
 *
 * Usage:
 * ```tsx
 * // In App.tsx
 * <DialogManager />
 *
 * // Anywhere in the app
 * import { presentDialog } from '@/componentsV2'
 *
 * presentDialog('error', {
 *   title: 'Delete',
 *   content: 'Are you sure?',
 *   showCancel: true,
 *   onConfirm: async () => {
 *     await deleteItem()
 *   }
 * })
 * ```
 */
export function DialogManager() {
  const { state, handleConfirm, handleCancel, handleOpenChange } = useDialogManagerState()

  return (
    <UnifiedDialog
      {...state}
      onOpenChange={handleOpenChange}
      onConfirmPress={handleConfirm}
      onCancelPress={handleCancel}
    />
  )
}

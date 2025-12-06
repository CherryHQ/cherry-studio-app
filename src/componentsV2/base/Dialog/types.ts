import type { ReactNode } from 'react'

export type DialogType = 'info' | 'error' | 'warning' | 'success'

export interface DialogProps {
  title: string
  content: string | ReactNode
  confirmText?: string
  onConfirm?: () => void | Promise<void>
  showCancel?: boolean
  cancelText?: string
  onCancel?: () => void
}

export interface DialogState extends DialogProps {
  type: DialogType
  isOpen: boolean
  isLoading: boolean
}

// Color mapping for each dialog type
export const DIALOG_COLORS: Record<DialogType, { border: string; bg: string; text: string; spinner: string }> = {
  info: {
    border: 'border-cyan-400/40',
    bg: 'bg-cyan-400/15',
    text: 'text-cyan-400',
    spinner: '#22d3ee'
  },
  error: {
    border: 'border-red-400/40',
    bg: 'bg-red-400/15',
    text: 'text-red-400',
    spinner: '#f87171'
  },
  warning: {
    border: 'border-amber-400/40',
    bg: 'bg-amber-400/15',
    text: 'text-amber-400',
    spinner: '#fbbf24'
  },
  success: {
    border: 'border-primary/30',
    bg: 'bg-primary/15',
    text: 'primary-text',
    spinner: 'primary-text'
  }
}

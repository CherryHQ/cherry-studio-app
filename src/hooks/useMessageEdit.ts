import { useCallback, useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'

import type { RootState } from '@/store'
import { setEditingMessage } from '@/store/runtime'
import type { Message } from '@/types/message'
import { getMainTextContent } from '@/utils/messageUtils/find'

interface UseEditMessageOptions {
  topicId: string
  onEditStart?: (content: string) => void
  onEditCancel?: () => void
}

export const useMessageEdit = (options: UseEditMessageOptions) => {
  const { topicId, onEditStart, onEditCancel } = options
  const dispatch = useDispatch()
  const editingMessage = useSelector((state: RootState) => state.runtime.editingMessage)
  const prevEditingMessageId = useRef<string | null>(null)

  const isEditing = !!editingMessage

  // Load editing content when editingMessage changes
  useEffect(() => {
    const loadEditingContent = async () => {
      if (editingMessage && editingMessage.id !== prevEditingMessageId.current) {
        prevEditingMessageId.current = editingMessage.id
        const content = await getMainTextContent(editingMessage)
        onEditStart?.(content)
      } else if (!editingMessage && prevEditingMessageId.current) {
        prevEditingMessageId.current = null
      }
    }
    loadEditingContent()
  }, [editingMessage, onEditStart])

  // Clear editing state when topic changes
  useEffect(() => {
    if (editingMessage && editingMessage.topicId !== topicId) {
      dispatch(setEditingMessage(null))
    }
  }, [topicId, editingMessage, dispatch])

  const startEdit = useCallback(
    (message: Message) => {
      if (message.role !== 'user') {
        return
      }
      dispatch(setEditingMessage(message))
    },
    [dispatch]
  )

  const cancelEdit = useCallback(() => {
    dispatch(setEditingMessage(null))
    onEditCancel?.()
  }, [dispatch, onEditCancel])

  const clearEditingState = useCallback(() => {
    dispatch(setEditingMessage(null))
  }, [dispatch])

  return {
    editingMessage,
    isEditing,
    startEdit,
    cancelEdit,
    clearEditingState
  }
}

import { act, renderHook } from '@testing-library/react-native'
import { Keyboard } from 'react-native'

import { presentDialog } from '@/componentsV2/base/Dialog'
import { useMessageEdit } from '@/hooks/useMessageEdit'
import { useMessageOperations } from '@/hooks/useMessageOperation'
import {
  editUserMessageAndRegenerate,
  getUserMessage,
  sendMessage as serviceSendMessage
} from '@/services/MessagesService'
import { topicService } from '@/services/TopicService'
import { type Message, UserMessageStatus } from '@/types/message'

import { createMockAssistant, createMockFile, createMockModel, createMockTopic } from '../../__mocks__/testData'
import { useMessageSend } from '../../hooks/useMessageSend'

jest.mock('@/componentsV2/base/Dialog', () => ({
  presentDialog: jest.fn()
}))

jest.mock('@/hooks/useMessageEdit', () => ({
  useMessageEdit: jest.fn()
}))

jest.mock('@/hooks/useMessageOperation', () => ({
  useMessageOperations: jest.fn()
}))

jest.mock('@/services/MessagesService', () => ({
  editUserMessageAndRegenerate: jest.fn(),
  getUserMessage: jest.fn(),
  sendMessage: jest.fn()
}))

jest.mock('@/services/TopicService', () => ({
  topicService: {
    updateTopic: jest.fn()
  }
}))

jest.mock('react-native', () => ({
  Keyboard: {
    dismiss: jest.fn()
  }
}))

const mockPresentDialog = presentDialog as jest.MockedFunction<typeof presentDialog>
const mockUseMessageEdit = useMessageEdit as jest.MockedFunction<typeof useMessageEdit>
const mockUseMessageOperations = useMessageOperations as jest.MockedFunction<typeof useMessageOperations>
const mockGetUserMessage = getUserMessage as jest.MockedFunction<typeof getUserMessage>
const mockServiceSendMessage = serviceSendMessage as jest.MockedFunction<typeof serviceSendMessage>
const mockEditUserMessageAndRegenerate = editUserMessageAndRegenerate as jest.MockedFunction<
  typeof editUserMessageAndRegenerate
>
const mockTopicService = topicService as jest.Mocked<typeof topicService>
const mockKeyboard = Keyboard as jest.Mocked<typeof Keyboard>

const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  role: 'user',
  assistantId: 'assistant-1',
  topicId: 'topic-1',
  createdAt: Date.now(),
  status: UserMessageStatus.SUCCESS,
  blocks: [],
  ...overrides
})

describe('useMessageSend', () => {
  const createDefaultProps = (overrides = {}) => ({
    topic: createMockTopic(),
    assistant: createMockAssistant(),
    text: '',
    files: [],
    mentions: [],
    clearInputs: jest.fn(),
    restoreInputs: jest.fn(),
    onEditStart: jest.fn(),
    onEditCancel: jest.fn(),
    ...overrides
  })

  beforeEach(() => {
    jest.clearAllMocks()

    mockUseMessageEdit.mockReturnValue({
      editingMessage: null,
      isEditing: false,
      startEdit: jest.fn(),
      cancelEdit: jest.fn(),
      clearEditingState: jest.fn()
    })

    mockUseMessageOperations.mockReturnValue({
      pauseMessages: jest.fn().mockResolvedValue(undefined)
    })

    mockGetUserMessage.mockReturnValue({
      message: createMockMessage(),
      blocks: []
    })

    mockServiceSendMessage.mockResolvedValue(undefined)
    mockEditUserMessageAndRegenerate.mockResolvedValue(undefined)
    mockTopicService.updateTopic.mockResolvedValue(undefined)
  })

  describe('initialization', () => {
    it('returns isEditing as false initially', () => {
      const { result } = renderHook(() => useMessageSend(createDefaultProps()))

      expect(result.current.isEditing).toBe(false)
    })

    it('returns sendMessage function', () => {
      const { result } = renderHook(() => useMessageSend(createDefaultProps()))

      expect(typeof result.current.sendMessage).toBe('function')
    })

    it('returns onPause function', () => {
      const { result } = renderHook(() => useMessageSend(createDefaultProps()))

      expect(typeof result.current.onPause).toBe('function')
    })

    it('returns cancelEditing function', () => {
      const { result } = renderHook(() => useMessageSend(createDefaultProps()))

      expect(typeof result.current.cancelEditing).toBe('function')
    })
  })

  describe('sendMessage', () => {
    it('does not send when text and files are empty', async () => {
      const props = createDefaultProps({ text: '', files: [] })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(mockServiceSendMessage).not.toHaveBeenCalled()
      expect(props.clearInputs).not.toHaveBeenCalled()
    })

    it('does not send when text is only whitespace', async () => {
      const props = createDefaultProps({ text: '   ', files: [] })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(mockServiceSendMessage).not.toHaveBeenCalled()
    })

    it('sends message with text', async () => {
      const props = createDefaultProps({ text: 'Hello world' })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(mockGetUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hello world'
        })
      )
      expect(mockServiceSendMessage).toHaveBeenCalled()
    })

    it('sends message with overrideText when provided', async () => {
      const props = createDefaultProps({ text: 'Original text' })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage('Override text')
      })

      expect(mockGetUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Override text'
        })
      )
    })

    it('sends message with files only', async () => {
      const files = [createMockFile({ id: 'file-1' })]
      const props = createDefaultProps({ text: '', files })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(mockGetUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          files
        })
      )
      expect(mockServiceSendMessage).toHaveBeenCalled()
    })

    it('sends message with text and files', async () => {
      const files = [createMockFile({ id: 'file-1' })]
      const props = createDefaultProps({ text: 'Hello', files })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(mockGetUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hello',
          files
        })
      )
    })

    it('includes mentions in message', async () => {
      const mentions = [createMockModel({ id: 'model-1' })]
      const props = createDefaultProps({ text: 'Hello', mentions })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(mockServiceSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          mentions
        }),
        expect.any(Array),
        expect.any(Object),
        expect.any(String)
      )
    })

    it('clears inputs after sending', async () => {
      const props = createDefaultProps({ text: 'Hello' })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(props.clearInputs).toHaveBeenCalled()
    })

    it('dismisses keyboard after sending', async () => {
      const props = createDefaultProps({ text: 'Hello' })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(mockKeyboard.dismiss).toHaveBeenCalled()
    })

    it('updates topic loading state', async () => {
      const topic = createMockTopic({ id: 'topic-123' })
      const props = createDefaultProps({ text: 'Hello', topic })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(mockTopicService.updateTopic).toHaveBeenCalledWith('topic-123', { isLoading: true })
    })

    it('handles send error gracefully', async () => {
      mockServiceSendMessage.mockRejectedValue(new Error('Send failed'))
      const props = createDefaultProps({ text: 'Hello' })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      // Should not throw
      expect(mockServiceSendMessage).toHaveBeenCalled()
    })
  })

  describe('editing mode', () => {
    it('reflects isEditing state from useMessageEdit', () => {
      mockUseMessageEdit.mockReturnValue({
        editingMessage: createMockMessage({ id: 'msg-1' }),
        isEditing: true,
        startEdit: jest.fn(),
        cancelEdit: jest.fn(),
        clearEditingState: jest.fn()
      })

      const { result } = renderHook(() => useMessageSend(createDefaultProps()))

      expect(result.current.isEditing).toBe(true)
    })

    it('edits message when in editing mode', async () => {
      const clearEditingState = jest.fn()
      mockUseMessageEdit.mockReturnValue({
        editingMessage: createMockMessage({ id: 'msg-edit' }),
        isEditing: true,
        startEdit: jest.fn(),
        cancelEdit: jest.fn(),
        clearEditingState
      })

      const props = createDefaultProps({ text: 'Updated text' })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(clearEditingState).toHaveBeenCalled()
      expect(mockEditUserMessageAndRegenerate).toHaveBeenCalledWith(
        'msg-edit',
        'Updated text',
        [],
        props.assistant,
        props.topic.id
      )
    })

    it('does not call sendMessage in editing mode', async () => {
      mockUseMessageEdit.mockReturnValue({
        editingMessage: createMockMessage({ id: 'msg-edit' }),
        isEditing: true,
        startEdit: jest.fn(),
        cancelEdit: jest.fn(),
        clearEditingState: jest.fn()
      })

      const props = createDefaultProps({ text: 'Updated text' })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(mockServiceSendMessage).not.toHaveBeenCalled()
    })

    it('handles edit error gracefully', async () => {
      mockUseMessageEdit.mockReturnValue({
        editingMessage: createMockMessage({ id: 'msg-edit' }),
        isEditing: true,
        startEdit: jest.fn(),
        cancelEdit: jest.fn(),
        clearEditingState: jest.fn()
      })
      mockEditUserMessageAndRegenerate.mockRejectedValue(new Error('Edit failed'))

      const props = createDefaultProps({ text: 'Updated text' })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      // Should not throw
      expect(mockEditUserMessageAndRegenerate).toHaveBeenCalled()
    })

    it('cancels editing via cancelEditing', () => {
      const cancelEdit = jest.fn()
      mockUseMessageEdit.mockReturnValue({
        editingMessage: createMockMessage({ id: 'msg-edit' }),
        isEditing: true,
        startEdit: jest.fn(),
        cancelEdit,
        clearEditingState: jest.fn()
      })

      const { result } = renderHook(() => useMessageSend(createDefaultProps()))

      act(() => {
        result.current.cancelEditing()
      })

      expect(cancelEdit).toHaveBeenCalled()
    })
  })

  describe('onPause', () => {
    it('calls pauseMessages', async () => {
      const pauseMessages = jest.fn().mockResolvedValue(undefined)
      mockUseMessageOperations.mockReturnValue({
        pauseMessages
      })

      const { result } = renderHook(() => useMessageSend(createDefaultProps()))

      await act(async () => {
        await result.current.onPause()
      })

      expect(pauseMessages).toHaveBeenCalled()
    })

    it('handles pause error gracefully', async () => {
      const pauseMessages = jest.fn().mockRejectedValue(new Error('Pause failed'))
      mockUseMessageOperations.mockReturnValue({
        pauseMessages
      })

      const { result } = renderHook(() => useMessageSend(createDefaultProps()))

      await act(async () => {
        await result.current.onPause()
      })

      // Should not throw
      expect(pauseMessages).toHaveBeenCalled()
    })
  })

  describe('hook options', () => {
    it('passes onEditStart to useMessageEdit', () => {
      const onEditStart = jest.fn()
      renderHook(() => useMessageSend(createDefaultProps({ onEditStart })))

      expect(mockUseMessageEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          onEditStart
        })
      )
    })

    it('passes onEditCancel to useMessageEdit', () => {
      const onEditCancel = jest.fn()
      renderHook(() => useMessageSend(createDefaultProps({ onEditCancel })))

      expect(mockUseMessageEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          onEditCancel
        })
      )
    })

    it('passes topicId to useMessageEdit', () => {
      const topic = createMockTopic({ id: 'custom-topic-id' })
      renderHook(() => useMessageSend(createDefaultProps({ topic })))

      expect(mockUseMessageEdit).toHaveBeenCalledWith(
        expect.objectContaining({
          topicId: 'custom-topic-id'
        })
      )
    })
  })

  describe('overrideText in editing mode', () => {
    it('uses overrideText when provided in editing mode', async () => {
      const clearEditingState = jest.fn()
      mockUseMessageEdit.mockReturnValue({
        editingMessage: createMockMessage({ id: 'msg-edit' }),
        isEditing: true,
        startEdit: jest.fn(),
        cancelEdit: jest.fn(),
        clearEditingState
      })

      const props = createDefaultProps({ text: 'Original text from props' })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage('Override text from Actions')
      })

      expect(mockEditUserMessageAndRegenerate).toHaveBeenCalledWith(
        'msg-edit',
        'Override text from Actions',
        [],
        props.assistant,
        props.topic.id
      )
    })

    it('uses props text when overrideText is not provided in editing mode', async () => {
      mockUseMessageEdit.mockReturnValue({
        editingMessage: createMockMessage({ id: 'msg-edit' }),
        isEditing: true,
        startEdit: jest.fn(),
        cancelEdit: jest.fn(),
        clearEditingState: jest.fn()
      })

      const props = createDefaultProps({ text: 'Props text value' })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(mockEditUserMessageAndRegenerate).toHaveBeenCalledWith(
        'msg-edit',
        'Props text value',
        [],
        props.assistant,
        props.topic.id
      )
    })
  })

  describe('error handling with restoreInputs and presentDialog', () => {
    it('calls restoreInputs and presentDialog on send error', async () => {
      mockServiceSendMessage.mockRejectedValue(new Error('Send failed'))
      const restoreInputs = jest.fn()

      const props = createDefaultProps({
        text: 'Test message',
        restoreInputs
      })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(restoreInputs).toHaveBeenCalledWith('Test message', [])
      expect(mockTopicService.updateTopic).toHaveBeenCalledWith(props.topic.id, { isLoading: false })
      expect(mockPresentDialog).toHaveBeenCalledWith('error', {
        title: 'message.send_failed.title',
        content: 'message.send_failed.content'
      })
    })

    it('calls restoreInputs and presentDialog on edit error', async () => {
      mockUseMessageEdit.mockReturnValue({
        editingMessage: createMockMessage({ id: 'msg-edit' }),
        isEditing: true,
        startEdit: jest.fn(),
        cancelEdit: jest.fn(),
        clearEditingState: jest.fn()
      })
      mockEditUserMessageAndRegenerate.mockRejectedValue(new Error('Edit failed'))
      const restoreInputs = jest.fn()

      const props = createDefaultProps({
        text: 'Edited message',
        restoreInputs
      })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(restoreInputs).toHaveBeenCalledWith('Edited message', [])
      expect(mockTopicService.updateTopic).toHaveBeenCalledWith(props.topic.id, { isLoading: false })
      expect(mockPresentDialog).toHaveBeenCalledWith('error', {
        title: 'message.edit_failed.title',
        content: 'message.edit_failed.content'
      })
    })

    it('restores files along with text on error', async () => {
      mockServiceSendMessage.mockRejectedValue(new Error('Send failed'))
      const restoreInputs = jest.fn()
      const files = [createMockFile({ id: 'file-1' }), createMockFile({ id: 'file-2' })]

      const props = createDefaultProps({
        text: 'Message with files',
        files,
        restoreInputs
      })
      const { result } = renderHook(() => useMessageSend(props))

      await act(async () => {
        await result.current.sendMessage()
      })

      expect(restoreInputs).toHaveBeenCalledWith('Message with files', files)
    })

    it('calls presentDialog on pause error', async () => {
      const pauseMessages = jest.fn().mockRejectedValue(new Error('Pause failed'))
      mockUseMessageOperations.mockReturnValue({
        pauseMessages
      })

      const { result } = renderHook(() => useMessageSend(createDefaultProps()))

      await act(async () => {
        await result.current.onPause()
      })

      expect(mockPresentDialog).toHaveBeenCalledWith('error', {
        title: 'message.pause_failed.title',
        content: 'message.pause_failed.content'
      })
    })
  })
})

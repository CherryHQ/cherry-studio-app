import { createMockFile, createMockModel } from '../../__mocks__/testData'
import type { MessageInputService } from '../../services/MessageInputService'
import { createMessageInputService } from '../../services/MessageInputService'
import type { MessageInputSubscriber } from '../../types'

describe('MessageInputService', () => {
  let service: MessageInputService

  beforeEach(() => {
    service = createMessageInputService()
  })

  describe('state management', () => {
    it('initializes with default state', () => {
      const state = service.getState()

      expect(state.text).toBe('')
      expect(state.files).toEqual([])
      expect(state.mentions).toEqual([])
      expect(state.isVoiceActive).toBe(false)
    })

    it('updates state partially', () => {
      service.setState({ text: 'hello' })

      const state = service.getState()
      expect(state.text).toBe('hello')
      expect(state.files).toEqual([])
    })

    it('resets state to initial', () => {
      service.setText('some text')
      service.addFiles([createMockFile()])
      service.setMentions([createMockModel()])
      service.setVoiceActive(true)

      service.resetState()

      const state = service.getState()
      expect(state.text).toBe('')
      expect(state.files).toEqual([])
      expect(state.mentions).toEqual([])
      expect(state.isVoiceActive).toBe(false)
    })

    it('returns immutable state copy', () => {
      const state1 = service.getState()
      const state2 = service.getState()

      expect(state1).not.toBe(state2)
      expect(state1).toEqual(state2)
    })
  })

  describe('text operations', () => {
    it('sets text', () => {
      service.setText('hello world')

      expect(service.getState().text).toBe('hello world')
    })

    it('clears text', () => {
      service.setText('hello world')
      service.clearText()

      expect(service.getState().text).toBe('')
    })
  })

  describe('file operations', () => {
    it('adds files', () => {
      const file1 = createMockFile({ id: 'file-1' })
      const file2 = createMockFile({ id: 'file-2' })

      service.addFiles([file1])
      expect(service.getState().files).toHaveLength(1)

      service.addFiles([file2])
      expect(service.getState().files).toHaveLength(2)
    })

    it('removes file by id', () => {
      const file1 = createMockFile({ id: 'file-1' })
      const file2 = createMockFile({ id: 'file-2' })
      service.addFiles([file1, file2])

      service.removeFile('file-1')

      const files = service.getState().files
      expect(files).toHaveLength(1)
      expect(files[0].id).toBe('file-2')
    })

    it('clears all files', () => {
      service.addFiles([createMockFile({ id: 'file-1' }), createMockFile({ id: 'file-2' })])

      service.clearFiles()

      expect(service.getState().files).toEqual([])
    })
  })

  describe('mention operations', () => {
    it('sets mentions', () => {
      const model1 = createMockModel({ id: 'model-1' })
      const model2 = createMockModel({ id: 'model-2' })

      service.setMentions([model1, model2])

      expect(service.getState().mentions).toHaveLength(2)
    })

    it('clears mentions', () => {
      service.setMentions([createMockModel()])

      service.clearMentions()

      expect(service.getState().mentions).toEqual([])
    })
  })

  describe('voice operations', () => {
    it('sets voice active state', () => {
      service.setVoiceActive(true)
      expect(service.getState().isVoiceActive).toBe(true)

      service.setVoiceActive(false)
      expect(service.getState().isVoiceActive).toBe(false)
    })
  })

  describe('subscription', () => {
    it('notifies subscribers on state change', () => {
      const subscriber: MessageInputSubscriber = {
        onStateChange: jest.fn(),
        onError: jest.fn()
      }
      service.subscribe(subscriber)
      jest.clearAllMocks() // Clear initial notification

      service.setText('new text')

      expect(subscriber.onStateChange).toHaveBeenCalledWith(expect.objectContaining({ text: 'new text' }))
    })

    it('notifies subscribers on error', () => {
      const subscriber: MessageInputSubscriber = {
        onStateChange: jest.fn(),
        onError: jest.fn()
      }
      service.subscribe(subscriber)

      const error = { type: 'general' as const, message: 'Test error' }
      service.setError(error)

      expect(subscriber.onError).toHaveBeenCalledWith(error)
    })

    it('delivers initial state to new subscribers', () => {
      service.setText('initial text')
      service.addFiles([createMockFile()])

      const subscriber: MessageInputSubscriber = {
        onStateChange: jest.fn(),
        onError: jest.fn()
      }
      service.subscribe(subscriber)

      expect(subscriber.onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'initial text',
          files: expect.arrayContaining([expect.objectContaining({ id: 'file-1' })])
        })
      )
    })

    it('delivers initial error to new subscribers if exists', () => {
      const error = { type: 'general' as const, message: 'Existing error' }
      service.setError(error)

      const subscriber: MessageInputSubscriber = {
        onStateChange: jest.fn(),
        onError: jest.fn()
      }
      service.subscribe(subscriber)

      expect(subscriber.onError).toHaveBeenCalledWith(error)
    })

    it('unsubscribes correctly', () => {
      const subscriber: MessageInputSubscriber = {
        onStateChange: jest.fn(),
        onError: jest.fn()
      }
      const unsubscribe = service.subscribe(subscriber)
      jest.clearAllMocks()

      unsubscribe()
      service.setText('after unsubscribe')

      expect(subscriber.onStateChange).not.toHaveBeenCalled()
    })

    it('notifies multiple subscribers', () => {
      const subscriber1: MessageInputSubscriber = {
        onStateChange: jest.fn(),
        onError: jest.fn()
      }
      const subscriber2: MessageInputSubscriber = {
        onStateChange: jest.fn(),
        onError: jest.fn()
      }

      service.subscribe(subscriber1)
      service.subscribe(subscriber2)
      jest.clearAllMocks()

      service.setText('broadcast')

      expect(subscriber1.onStateChange).toHaveBeenCalled()
      expect(subscriber2.onStateChange).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('sets error', () => {
      const error = { type: 'send_failed' as const, message: 'Failed to send' }

      service.setError(error)

      expect(service.getLastError()).toEqual(error)
    })

    it('clears error', () => {
      service.setError({ type: 'general' as const, message: 'Error' })

      service.clearError()

      expect(service.getLastError()).toBeNull()
    })

    it('returns last error', () => {
      expect(service.getLastError()).toBeNull()

      const error = { type: 'file_upload' as const, message: 'Upload failed' }
      service.setError(error)

      expect(service.getLastError()).toEqual(error)
    })

    it('clears error on reset', () => {
      service.setError({ type: 'general' as const, message: 'Error' })

      service.resetState()

      expect(service.getLastError()).toBeNull()
    })
  })
})

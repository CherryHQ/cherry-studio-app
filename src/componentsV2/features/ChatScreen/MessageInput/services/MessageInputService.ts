import type { Model } from '@/types/assistant'
import type { FileMetadata } from '@/types/file'

import type { MessageInputError, MessageInputState, MessageInputSubscriber } from '../types'
import { createInitialState } from '../types'

/**
 * Abstract interface for MessageInputService
 * Allows for easier testing and potential implementation swapping
 */
export interface IMessageInputService {
  // State management
  getState(): MessageInputState
  setState(partial: Partial<MessageInputState>): void
  resetState(): void

  // Text operations
  setText(text: string): void
  clearText(): void

  // File operations
  addFiles(files: FileMetadata[]): void
  removeFile(fileId: string): void
  clearFiles(): void

  // Mention operations
  setMentions(mentions: Model[]): void
  clearMentions(): void

  // Voice operations
  setVoiceActive(active: boolean): void

  // Subscription
  subscribe(subscriber: MessageInputSubscriber): () => void

  // Error handling
  getLastError(): MessageInputError | null
  setError(error: MessageInputError | null): void
  clearError(): void
}

/**
 * Concrete implementation of MessageInputService
 * Manages state and subscriber notifications following pub/sub pattern
 */
export class MessageInputService implements IMessageInputService {
  private subscribers = new Set<MessageInputSubscriber>()
  private state: MessageInputState = createInitialState()
  private lastError: MessageInputError | null = null

  // State management
  getState(): MessageInputState {
    return { ...this.state }
  }

  setState(partial: Partial<MessageInputState>): void {
    this.state = { ...this.state, ...partial }
    this.notifyStateChange()
  }

  resetState(): void {
    this.state = createInitialState()
    this.lastError = null
    this.notifyStateChange()
    this.notifyError(null)
  }

  // Text operations
  setText(text: string): void {
    this.setState({ text })
  }

  clearText(): void {
    this.setState({ text: '' })
  }

  // File operations
  addFiles(files: FileMetadata[]): void {
    this.setState({ files: [...this.state.files, ...files] })
  }

  removeFile(fileId: string): void {
    this.setState({
      files: this.state.files.filter(f => f.id !== fileId)
    })
  }

  clearFiles(): void {
    this.setState({ files: [] })
  }

  // Mention operations
  setMentions(mentions: Model[]): void {
    this.setState({ mentions })
  }

  clearMentions(): void {
    this.setState({ mentions: [] })
  }

  // Voice operations
  setVoiceActive(active: boolean): void {
    this.setState({ isVoiceActive: active })
  }

  // Subscription
  subscribe(subscriber: MessageInputSubscriber): () => void {
    this.subscribers.add(subscriber)

    // Immediately notify with current state
    subscriber.onStateChange(this.state)
    if (this.lastError) {
      subscriber.onError(this.lastError)
    }

    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  // Error handling
  getLastError(): MessageInputError | null {
    return this.lastError
  }

  setError(error: MessageInputError | null): void {
    this.lastError = error
    this.notifyError(error)
  }

  clearError(): void {
    this.setError(null)
  }

  // Private notification methods
  private notifyStateChange(): void {
    const stateCopy = { ...this.state }
    this.subscribers.forEach(s => s.onStateChange(stateCopy))
  }

  private notifyError(error: MessageInputError | null): void {
    this.subscribers.forEach(s => s.onError(error))
  }
}

/**
 * Default singleton instance for global access
 */
let defaultInstance: MessageInputService | null = null

export function getMessageInputService(): MessageInputService {
  if (!defaultInstance) {
    defaultInstance = new MessageInputService()
  }
  return defaultInstance
}

/**
 * Create a new instance (useful for testing or multiple inputs)
 */
export function createMessageInputService(): MessageInputService {
  return new MessageInputService()
}

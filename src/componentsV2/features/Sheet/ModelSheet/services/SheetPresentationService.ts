import { TrueSheet } from '@lodev09/react-native-true-sheet'

import type { ModelSheetConfig, SheetSubscriber } from '../types'

/**
 * Abstract interface for sheet presentation
 * Allows for easier testing and potential implementation swapping
 */
export interface ISheetPresentationService {
  present(config: ModelSheetConfig): Promise<void>
  dismiss(): Promise<void>
  subscribe(subscriber: SheetSubscriber): () => void
  getCurrentConfig(): ModelSheetConfig | null
  notifyVisibilityChange(isVisible: boolean): void
}

/**
 * Concrete implementation using TrueSheet
 * Manages sheet presentation and subscriber notifications
 */
export class SheetPresentationService implements ISheetPresentationService {
  private subscribers = new Set<SheetSubscriber>()
  private currentConfig: ModelSheetConfig | null = null

  constructor(private sheetName: string) {}

  async present(config: ModelSheetConfig): Promise<void> {
    this.currentConfig = config
    this.notifyConfigChange(config)
    return TrueSheet.present(this.sheetName)
  }

  async dismiss(): Promise<void> {
    return TrueSheet.dismiss(this.sheetName)
  }

  subscribe(subscriber: SheetSubscriber): () => void {
    this.subscribers.add(subscriber)

    // Immediately notify with current state if config exists
    if (this.currentConfig) {
      subscriber.onConfigChange(this.currentConfig)
    }

    return () => {
      this.subscribers.delete(subscriber)
    }
  }

  getCurrentConfig(): ModelSheetConfig | null {
    return this.currentConfig
  }

  private notifyConfigChange(config: ModelSheetConfig | null) {
    this.subscribers.forEach(s => s.onConfigChange(config))
  }

  notifyVisibilityChange(isVisible: boolean) {
    this.subscribers.forEach(s => s.onVisibilityChange(isVisible))
  }
}

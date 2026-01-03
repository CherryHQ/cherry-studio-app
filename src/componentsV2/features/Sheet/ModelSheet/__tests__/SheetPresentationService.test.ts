import { TrueSheet } from '@lodev09/react-native-true-sheet'

import type { Model } from '@/types/assistant'

import { SheetPresentationService } from '../services/SheetPresentationService'
import type { ModelSheetConfig } from '../types'

jest.mock('@lodev09/react-native-true-sheet', () => ({
  TrueSheet: {
    present: jest.fn(() => Promise.resolve()),
    dismiss: jest.fn(() => Promise.resolve())
  }
}))

const buildModel = (id: string, provider: string, name: string): Model => ({
  id,
  provider,
  name,
  group: 'test'
})

describe('SheetPresentationService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('presents the sheet and notifies subscribers', async () => {
    const service = new SheetPresentationService('test-sheet')
    const config: ModelSheetConfig = {
      mentions: [buildModel('alpha', 'provider-a', 'Alpha')],
      setMentions: jest.fn(),
      multiple: true
    }
    const subscriber = {
      onConfigChange: jest.fn(),
      onVisibilityChange: jest.fn()
    }

    service.subscribe(subscriber)
    await service.present(config)

    expect(TrueSheet.present).toHaveBeenCalledWith('test-sheet')
    expect(subscriber.onConfigChange).toHaveBeenCalledWith(config)
    expect(service.getCurrentConfig()).toBe(config)
  })

  it('notifies new subscribers with current config', async () => {
    const service = new SheetPresentationService('test-sheet')
    const config: ModelSheetConfig = {
      mentions: [buildModel('alpha', 'provider-a', 'Alpha')],
      setMentions: jest.fn(),
      multiple: false
    }

    await service.present(config)
    const subscriber = {
      onConfigChange: jest.fn(),
      onVisibilityChange: jest.fn()
    }

    service.subscribe(subscriber)

    expect(subscriber.onConfigChange).toHaveBeenCalledWith(config)
  })

  it('dismisses the sheet', async () => {
    const service = new SheetPresentationService('test-sheet')

    await service.dismiss()

    expect(TrueSheet.dismiss).toHaveBeenCalledWith('test-sheet')
  })

  it('notifies subscribers about visibility changes', () => {
    const service = new SheetPresentationService('test-sheet')
    const subscriber = {
      onConfigChange: jest.fn(),
      onVisibilityChange: jest.fn()
    }

    service.subscribe(subscriber)
    service.notifyVisibilityChange(true)

    expect(subscriber.onVisibilityChange).toHaveBeenCalledWith(true)
  })

  it('stops notifying after unsubscribe', async () => {
    const service = new SheetPresentationService('test-sheet')
    const config: ModelSheetConfig = {
      mentions: [buildModel('alpha', 'provider-a', 'Alpha')],
      setMentions: jest.fn(),
      multiple: false
    }
    const subscriber = {
      onConfigChange: jest.fn(),
      onVisibilityChange: jest.fn()
    }

    const unsubscribe = service.subscribe(subscriber)
    unsubscribe()

    await service.present(config)
    service.notifyVisibilityChange(true)

    expect(subscriber.onConfigChange).not.toHaveBeenCalledWith(config)
    expect(subscriber.onVisibilityChange).not.toHaveBeenCalledWith(true)
  })

  it('notifies multiple subscribers simultaneously', async () => {
    const service = new SheetPresentationService('test-sheet')
    const config: ModelSheetConfig = {
      mentions: [buildModel('alpha', 'provider-a', 'Alpha')],
      setMentions: jest.fn(),
      multiple: true
    }
    const subscriber1 = {
      onConfigChange: jest.fn(),
      onVisibilityChange: jest.fn()
    }
    const subscriber2 = {
      onConfigChange: jest.fn(),
      onVisibilityChange: jest.fn()
    }

    service.subscribe(subscriber1)
    service.subscribe(subscriber2)
    await service.present(config)

    expect(subscriber1.onConfigChange).toHaveBeenCalledWith(config)
    expect(subscriber2.onConfigChange).toHaveBeenCalledWith(config)
  })

  it('preserves config after dismiss for reuse', async () => {
    const service = new SheetPresentationService('test-sheet')
    const config: ModelSheetConfig = {
      mentions: [buildModel('alpha', 'provider-a', 'Alpha')],
      setMentions: jest.fn(),
      multiple: false
    }

    await service.present(config)
    expect(service.getCurrentConfig()).toBe(config)

    await service.dismiss()
    expect(service.getCurrentConfig()).toBe(config)
  })

  it('overwrites config when present is called twice', async () => {
    const service = new SheetPresentationService('test-sheet')
    const config1: ModelSheetConfig = {
      mentions: [buildModel('alpha', 'provider-a', 'Alpha')],
      setMentions: jest.fn(),
      multiple: false
    }
    const config2: ModelSheetConfig = {
      mentions: [buildModel('beta', 'provider-b', 'Beta')],
      setMentions: jest.fn(),
      multiple: true
    }

    await service.present(config1)
    expect(service.getCurrentConfig()).toBe(config1)

    await service.present(config2)
    expect(service.getCurrentConfig()).toBe(config2)
  })
})

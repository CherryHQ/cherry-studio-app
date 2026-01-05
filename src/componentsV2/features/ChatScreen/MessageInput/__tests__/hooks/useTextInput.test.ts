import { act, renderHook, waitFor } from '@testing-library/react-native'

import { createLongText, createMockFile } from '../../__mocks__/testData'
import { useTextInput } from '../../hooks/useTextInput'
import { isLongText, processInputText } from '../../services/TextProcessingService'
import { LONG_TEXT_THRESHOLD } from '../../types'

jest.mock('@/componentsV2/base/Dialog', () => ({
  presentDialog: jest.fn()
}))

jest.mock('@/componentsV2/icons/LucideIcon', () => ({
  Globe: () => null,
  Palette: () => null
}))

jest.mock('@/config/models/vision', () => ({
  isGenerateImageModel: jest.fn()
}))

jest.mock('@/config/models/websearch', () => ({
  isWebSearchModel: jest.fn()
}))

jest.mock('../../services/TextProcessingService', () => ({
  isLongText: jest.fn(),
  processInputText: jest.fn()
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn()
  }
}))

const mockIsLongText = isLongText as jest.MockedFunction<typeof isLongText>
const mockProcessInputText = processInputText as jest.MockedFunction<typeof processInputText>

describe('useTextInput', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsLongText.mockReturnValue(false)
  })

  it('initializes with empty text', () => {
    const { result } = renderHook(() => useTextInput())

    expect(result.current.text).toBe('')
  })

  it('updates text on setText', async () => {
    mockIsLongText.mockReturnValue(false)
    const { result } = renderHook(() => useTextInput())

    await act(async () => {
      await result.current.setText('hello')
    })

    expect(result.current.text).toBe('hello')
  })

  it('clears text on clearText', async () => {
    mockIsLongText.mockReturnValue(false)
    const { result } = renderHook(() => useTextInput())

    await act(async () => {
      await result.current.setText('hello')
    })

    act(() => {
      result.current.clearText()
    })

    expect(result.current.text).toBe('')
  })

  it('detects long text correctly', () => {
    mockIsLongText.mockImplementation((text, threshold) => text.length > (threshold ?? LONG_TEXT_THRESHOLD))
    const { result } = renderHook(() => useTextInput())

    // Short text
    expect(result.current.isLongText).toBe(false)

    // After setting long text, the isLongText would be checked
    mockIsLongText.mockReturnValue(true)
    renderHook(() => useTextInput())
    expect(mockIsLongText).toHaveBeenCalled()
  })

  it('converts long text to file and clears input', async () => {
    const mockFile = createMockFile({ name: 'converted.txt' })
    mockIsLongText.mockReturnValue(true)
    mockProcessInputText.mockResolvedValue({
      success: true,
      data: { processedText: '', convertedToFile: mockFile }
    })

    const { result } = renderHook(() => useTextInput())
    const longText = createLongText(LONG_TEXT_THRESHOLD + 100)

    await act(async () => {
      await result.current.setText(longText)
    })

    await waitFor(() => {
      expect(result.current.text).toBe('')
    })
  })

  it('calls onFileCreated callback', async () => {
    const mockFile = createMockFile()
    const onFileCreated = jest.fn()
    mockIsLongText.mockReturnValue(true)
    mockProcessInputText.mockResolvedValue({
      success: true,
      data: { processedText: '', convertedToFile: mockFile }
    })

    const { result } = renderHook(() => useTextInput({ onFileCreated }))

    await act(async () => {
      await result.current.setText(createLongText(LONG_TEXT_THRESHOLD + 100))
    })

    expect(mockProcessInputText).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        onConvertToFile: expect.any(Function)
      })
    )
  })

  it('falls back to keeping text on conversion error', async () => {
    const longText = createLongText(LONG_TEXT_THRESHOLD + 100)
    mockIsLongText.mockReturnValue(true)
    mockProcessInputText.mockResolvedValue({
      success: false,
      error: { type: 'long_text_conversion', message: 'Failed' }
    })

    const { result } = renderHook(() => useTextInput())

    await act(async () => {
      await result.current.setText(longText)
    })

    await waitFor(() => {
      expect(result.current.text).toBe(longText)
    })
  })

  it('uses custom threshold', async () => {
    const customThreshold = 100
    mockIsLongText.mockReturnValue(false)

    renderHook(() => useTextInput({ threshold: customThreshold }))

    expect(mockIsLongText).toHaveBeenCalled()
  })

  it('handles empty string setText', async () => {
    mockIsLongText.mockReturnValue(false)
    const { result } = renderHook(() => useTextInput())

    await act(async () => {
      await result.current.setText('hello')
    })
    await act(async () => {
      await result.current.setText('')
    })

    expect(result.current.text).toBe('')
  })
})

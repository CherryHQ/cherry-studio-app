import { markdownToPlainText } from '../markdown'

describe('markdownToPlainText', () => {
  it('returns empty string for empty input', () => {
    expect(markdownToPlainText('')).toBe('')
  })

  it('removes markdown formatting while preserving text', () => {
    const input = '# Title\n\nHello **world**'
    expect(markdownToPlainText(input)).toBe('Title\n\nHello world')
  })

  it('keeps code content and link text', () => {
    const input = '`code` and ```\nblock\n``` and [link](https://example.com)'
    expect(markdownToPlainText(input)).toBe('code and block and link')
  })
})

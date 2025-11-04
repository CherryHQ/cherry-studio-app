import { extractInfoFromXML } from '../extract'

describe('extract utils', () => {
  describe('extractInfoFromXML', () => {
    it('should extract websearch information with questions', () => {
      const xml = `<websearch><question>What is AI?</question><question>What is ML?</question></websearch>`
      const result = extractInfoFromXML(xml)
      expect(result.websearch).toBeDefined()
      expect(result.websearch?.question).toEqual(['What is AI?', 'What is ML?'])
    })

    it('should extract websearch information with links', () => {
      const xml = `<websearch><question>Test</question><links>https://example.com</links><links>https://test.com</links></websearch>`
      const result = extractInfoFromXML(xml)
      expect(result.websearch).toBeDefined()
      expect(result.websearch?.question).toEqual(['Test'])
      expect(result.websearch?.links).toEqual(['https://example.com', 'https://test.com'])
    })

    it('should extract knowledge information', () => {
      const xml = `<knowledge><rewrite>Rewritten query</rewrite><question>Q1</question><question>Q2</question></knowledge>`
      const result = extractInfoFromXML(xml)
      expect(result.knowledge).toBeDefined()
      expect(result.knowledge?.rewrite).toBe('Rewritten query')
      expect(result.knowledge?.question).toEqual(['Q1', 'Q2'])
    })

    it('should handle single question as array', () => {
      const xml = `<websearch><question>Single question</question></websearch>`
      const result = extractInfoFromXML(xml)
      expect(result.websearch?.question).toEqual(['Single question'])
      expect(Array.isArray(result.websearch?.question)).toBe(true)
    })

    it('should handle multiple questions', () => {
      const xml = `<websearch><question>First</question><question>Second</question></websearch>`
      const result = extractInfoFromXML(xml)
      expect(result.websearch?.question).toEqual(['First', 'Second'])
    })

    it('should handle knowledge with questions', () => {
      const xml = `<knowledge><rewrite>Test rewrite</rewrite><question>Q1</question><question>Q2</question></knowledge>`
      const result = extractInfoFromXML(xml)
      expect(result.knowledge?.rewrite).toBe('Test rewrite')
      expect(result.knowledge?.question).toEqual(['Q1', 'Q2'])
    })
  })
})

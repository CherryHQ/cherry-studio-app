import { isJSON, parseJSON, safeJsonParse } from '../json'

describe('json utils', () => {
  describe('isJSON', () => {
    it('should return true for valid JSON strings', () => {
      expect(isJSON('{}')).toBe(true)
      expect(isJSON('[]')).toBe(true)
      expect(isJSON('{"name":"test"}')).toBe(true)
      expect(isJSON('[1,2,3]')).toBe(true)
      expect(isJSON('null')).toBe(true)
    })

    it('should return false for invalid JSON strings', () => {
      expect(isJSON('hello')).toBe(false)
      expect(isJSON('{invalid}')).toBe(false)
      expect(isJSON('undefined')).toBe(false)
    })

    it('should return false for non-string inputs', () => {
      expect(isJSON(123)).toBe(false)
      expect(isJSON(null)).toBe(false)
      expect(isJSON(undefined)).toBe(false)
      expect(isJSON({})).toBe(false)
      expect(isJSON([])).toBe(false)
    })

    it('should handle empty string', () => {
      expect(isJSON('')).toBe(false)
    })
  })

  describe('parseJSON', () => {
    it('should parse valid JSON strings', () => {
      expect(parseJSON('{}')).toEqual({})
      expect(parseJSON('[]')).toEqual([])
      expect(parseJSON('{"name":"test"}')).toEqual({ name: 'test' })
      expect(parseJSON('[1,2,3]')).toEqual([1, 2, 3])
      expect(parseJSON('null')).toBeNull()
    })

    it('should return null for invalid JSON strings', () => {
      expect(parseJSON('hello')).toBeNull()
      expect(parseJSON('{invalid}')).toBeNull()
      expect(parseJSON('undefined')).toBeNull()
    })

    it('should handle empty string', () => {
      expect(parseJSON('')).toBeNull()
    })

    it('should parse complex objects', () => {
      const complex = '{"users":[{"id":1,"name":"John"},{"id":2,"name":"Jane"}]}'
      expect(parseJSON(complex)).toEqual({
        users: [
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' }
        ]
      })
    })
  })

  describe('safeJsonParse', () => {
    it('should parse valid JSON strings', () => {
      expect(safeJsonParse('{}')).toEqual({})
      expect(safeJsonParse('[]')).toEqual([])
      expect(safeJsonParse('{"name":"test"}')).toEqual({ name: 'test' })
    })

    it('should return defaultValue for invalid JSON strings', () => {
      expect(safeJsonParse('invalid')).toBeUndefined()
      expect(safeJsonParse('invalid', null)).toBeNull()
      expect(safeJsonParse('invalid', {})).toEqual({})
      expect(safeJsonParse('invalid', 'default')).toBe('default')
    })

    it('should return defaultValue for non-string inputs', () => {
      expect(safeJsonParse(null)).toBeUndefined()
      expect(safeJsonParse(null, 'default')).toBe('default')
      // @ts-ignore - testing runtime behavior
      expect(safeJsonParse(123, 'default')).toBe('default')
      // @ts-ignore - testing runtime behavior
      expect(safeJsonParse(undefined, 'default')).toBe('default')
    })

    it('should use undefined as default when not specified', () => {
      expect(safeJsonParse('invalid')).toBeUndefined()
      expect(safeJsonParse(null)).toBeUndefined()
    })

    it('should parse and return complex objects', () => {
      const complex = '{"data":{"nested":true}}'
      expect(safeJsonParse(complex, {})).toEqual({ data: { nested: true } })
    })
  })
})

import { getPotentialStartIndex } from '../getPotentialIndex'

describe('getPotentialStartIndex', () => {
  it('should return null for empty searchedText', () => {
    expect(getPotentialStartIndex('hello world', '')).toBeNull()
  })

  it('should return the index when searchedText is found directly', () => {
    expect(getPotentialStartIndex('hello world', 'world')).toBe(6)
    expect(getPotentialStartIndex('hello world', 'hello')).toBe(0)
  })

  it('should return null when searchedText is not found and has no suffix match', () => {
    expect(getPotentialStartIndex('hello', 'xyz')).toBeNull()
  })

  it('should return the index of the largest suffix matching a prefix of searchedText', () => {
    // "hello wor" where "wor" is a prefix of "world"
    expect(getPotentialStartIndex('hello wor', 'world')).toBe(6)
    // "test" where "t" is a prefix of "testing"
    expect(getPotentialStartIndex('test', 'testing')).toBe(3)
  })

  it('should handle exact match', () => {
    expect(getPotentialStartIndex('testing', 'testing')).toBe(0)
  })

  it('should handle partial suffix match', () => {
    // "ab" where "b" is prefix of "bc"
    expect(getPotentialStartIndex('ab', 'bc')).toBe(1)
    // "data-" where "-" is not a valid prefix of "test"
    expect(getPotentialStartIndex('data-', 'test')).toBeNull()
  })

  it('should handle empty text', () => {
    expect(getPotentialStartIndex('', 'hello')).toBeNull()
  })

  it('should handle special characters', () => {
    expect(getPotentialStartIndex('hello!', '!world')).toBe(5)
    expect(getPotentialStartIndex('test\n', '\nline')).toBe(4)
  })
})

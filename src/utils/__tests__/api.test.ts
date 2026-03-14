import { formatApiHost, hasAPIVersion } from '../api'

describe('api utils', () => {
  describe('formatApiHost', () => {
    describe('empty and edge cases', () => {
      it('should return empty string when host is undefined', () => {
        expect(formatApiHost(undefined)).toBe('')
      })

      it('should return empty string when host is empty string', () => {
        expect(formatApiHost('')).toBe('')
      })

      it('should return empty string when host is only whitespace', () => {
        expect(formatApiHost('   ')).toBe('')
      })
    })

    describe('basic formatting', () => {
      it('should append default version v1 to host without trailing slash', () => {
        expect(formatApiHost('https://api.example.com')).toBe('https://api.example.com/v1')
      })

      it('should append default version v1 to host with trailing slash and remove slash', () => {
        expect(formatApiHost('https://api.example.com/')).toBe('https://api.example.com/v1')
      })

      it('should append custom version', () => {
        expect(formatApiHost('https://api.example.com', true, 'v2')).toBe('https://api.example.com/v2')
      })

      it('should trim trailing whitespace', () => {
        expect(formatApiHost('  https://api.example.com  ')).toBe('https://api.example.com/v1')
      })
    })

    describe('hosts that already contain version', () => {
      it('should not append version when host already contains /v1', () => {
        expect(formatApiHost('https://api.example.com/v1')).toBe('https://api.example.com/v1')
      })

      it('should not append version when host already contains /v2', () => {
        expect(formatApiHost('https://api.example.com/v2')).toBe('https://api.example.com/v2')
      })

      it('should not append version when host already contains /v3alpha', () => {
        expect(formatApiHost('https://api.example.com/v3alpha')).toBe('https://api.example.com/v3alpha')
      })

      it('should not append version when host already contains /v4beta', () => {
        expect(formatApiHost('https://api.example.com/v4beta')).toBe('https://api.example.com/v4beta')
      })

      it('should not append version to path that already contains version', () => {
        expect(formatApiHost('https://api.example.com/v1/resources')).toBe('https://api.example.com/v1/resources')
      })
    })

    describe('supportApiVersion parameter', () => {
      it('should skip appending version when supportApiVersion is false', () => {
        expect(formatApiHost('https://api.example.com', false)).toBe('https://api.example.com')
      })

      it('should skip appending version when supportApiVersion is false even with trailing slash', () => {
        expect(formatApiHost('https://api.example.com/', false)).toBe('https://api.example.com')
      })
    })

    describe('hosts ending with #', () => {
      it('should remove trailing # and return host without appending version', () => {
        expect(formatApiHost('https://api.example.com#')).toBe('https://api.example.com')
      })

      it('should remove trailing # and return host without appending version (trailing slash is preserved)', () => {
        expect(formatApiHost('https://api.example.com/#')).toBe('https://api.example.com/')
      })
    })

    describe('various URL formats', () => {
      it('should handle http protocol', () => {
        expect(formatApiHost('http://api.example.com')).toBe('http://api.example.com/v1')
      })

      it('should handle URL with port', () => {
        expect(formatApiHost('https://api.example.com:8080')).toBe('https://api.example.com:8080/v1')
      })

      it('should handle URL with path', () => {
        expect(formatApiHost('https://api.example.com/path')).toBe('https://api.example.com/path/v1')
      })

      it('should handle localhost URL', () => {
        expect(formatApiHost('http://localhost:3000')).toBe('http://localhost:3000/v1')
      })

      it('should handle host without protocol', () => {
        expect(formatApiHost('api.example.com')).toBe('api.example.com/v1')
      })
    })
  })

  describe('hasAPIVersion', () => {
    it('should return false when host is undefined', () => {
      expect(hasAPIVersion(undefined)).toBe(false)
    })

    it('should return false when host is empty string', () => {
      expect(hasAPIVersion('')).toBe(false)
    })

    it('should return true when host contains /v1', () => {
      expect(hasAPIVersion('https://api.example.com/v1')).toBe(true)
    })

    it('should return true when host contains /v2beta', () => {
      expect(hasAPIVersion('https://api.example.com/v2beta')).toBe(true)
    })

    it('should return true when host contains /v3alpha', () => {
      expect(hasAPIVersion('https://api.example.com/v3alpha')).toBe(true)
    })

    it('should return true when version is in path', () => {
      expect(hasAPIVersion('https://api.example.com/v1/resources')).toBe(true)
    })

    it('should return false when host does not contain version', () => {
      expect(hasAPIVersion('https://api.example.com')).toBe(false)
    })

    it('should match version case-insensitively', () => {
      expect(hasAPIVersion('https://api.example.com/V1')).toBe(true)
    })
  })
})

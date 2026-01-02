/**
 * MobileOAuthProvider tests
 *
 * Tests for OAuth provider, state validation, PKCE, and Zod validation.
 */

import * as WebBrowser from 'expo-web-browser'

import { storage } from '@/utils'

import {
  clearOAuthTokens,
  createMobileOAuthProvider,
  hasOAuthTokens,
  MobileOAuthProvider,
  performOAuthFlow
} from '../MobileOAuthProvider'

// Access global mock storage from jest.setup.js
declare global {
  var __mockStorageData: Map<string, string>

  var __mockUuidValue: string
}

// Mock expo modules
jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(() => new Uint8Array(32).fill(65)),
  digest: jest.fn(async () => new ArrayBuffer(32)),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' }
}))

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn()
}))

// Helper to reset storage
const resetStorage = () => {
  global.__mockStorageData?.clear()
  jest.clearAllMocks()
}

describe('MobileOAuthProvider', () => {
  beforeEach(() => {
    resetStorage()
  })

  // ==================== Constructor & Storage Keys ====================
  describe('Constructor and Storage Keys', () => {
    it('should create provider with server hash', () => {
      const provider = new MobileOAuthProvider('test-hash')
      expect(provider).toBeDefined()
    })

    it('should generate correct redirect URL', () => {
      const provider = new MobileOAuthProvider('test-hash')
      expect(provider.redirectUrl).toBe('cherry-studio://oauth/callback')
    })

    it('should return correct client metadata', () => {
      const provider = new MobileOAuthProvider('test-hash')
      const metadata = provider.clientMetadata

      expect(metadata.redirect_uris).toContain('cherry-studio://oauth/callback')
      expect(metadata.token_endpoint_auth_method).toBe('none')
      expect(metadata.grant_types).toContain('authorization_code')
      expect(metadata.client_name).toBe('Cherry Studio App')
    })
  })

  // ==================== State Management (CSRF Protection) ====================
  describe('State Management (CSRF Protection)', () => {
    it('should generate and save state', () => {
      const provider = new MobileOAuthProvider('test-hash')

      const state = provider.state()

      // State should be a non-empty string (UUID format)
      expect(state).toBeTruthy()
      expect(typeof state).toBe('string')
      expect(storage.set).toHaveBeenCalledWith('mcp_oauth_test-hash_state', state)
    })

    it('should verify valid state', () => {
      const provider = new MobileOAuthProvider('test-hash')
      global.__mockStorageData.set('mcp_oauth_test-hash_state', 'valid-state')

      expect(provider.verifyState('valid-state')).toBe(true)
    })

    it('should reject invalid state (CSRF protection)', () => {
      const provider = new MobileOAuthProvider('test-hash')
      global.__mockStorageData.set('mcp_oauth_test-hash_state', 'expected-state')

      expect(provider.verifyState('attacker-state')).toBe(false)
    })

    it('should reject when no stored state exists', () => {
      const provider = new MobileOAuthProvider('test-hash')
      // No state stored

      expect(provider.verifyState('any-state')).toBe(false)
    })
  })

  // ==================== PKCE Code Verifier ====================
  describe('PKCE Code Verifier', () => {
    it('should save code verifier', () => {
      const provider = new MobileOAuthProvider('test-hash')

      provider.saveCodeVerifier('verifier-123')

      expect(storage.set).toHaveBeenCalledWith('mcp_oauth_test-hash_verifier', 'verifier-123')
    })

    it('should retrieve saved code verifier', () => {
      const provider = new MobileOAuthProvider('test-hash')
      global.__mockStorageData.set('mcp_oauth_test-hash_verifier', 'stored-verifier')

      expect(provider.codeVerifier()).toBe('stored-verifier')
    })

    it('should throw error when code verifier not found', () => {
      const provider = new MobileOAuthProvider('test-hash')
      // No verifier stored

      expect(() => provider.codeVerifier()).toThrow('PKCE code verifier not found')
    })
  })

  // ==================== Token Storage ====================
  describe('Token Storage', () => {
    it('should save tokens', () => {
      const provider = new MobileOAuthProvider('test-hash')
      const tokens = { access_token: 'test-token', token_type: 'Bearer' }

      provider.saveTokens(tokens as any)

      expect(storage.set).toHaveBeenCalledWith('mcp_oauth_test-hash_tokens', JSON.stringify(tokens))
    })

    it('should retrieve saved tokens', () => {
      const provider = new MobileOAuthProvider('test-hash')
      const tokens = { access_token: 'test-token', token_type: 'Bearer' }
      global.__mockStorageData.set('mcp_oauth_test-hash_tokens', JSON.stringify(tokens))

      expect(provider.tokens()).toEqual(tokens)
    })

    it('should return undefined when no tokens stored', () => {
      const provider = new MobileOAuthProvider('test-hash')

      expect(provider.tokens()).toBeUndefined()
    })

    it('should handle corrupted token data gracefully', () => {
      const provider = new MobileOAuthProvider('test-hash')
      global.__mockStorageData.set('mcp_oauth_test-hash_tokens', 'invalid-json{')

      const result = provider.tokens()

      expect(result).toBeUndefined()
      expect(storage.delete).toHaveBeenCalledWith('mcp_oauth_test-hash_tokens')
    })
  })

  // ==================== Client Information Storage ====================
  describe('Client Information Storage', () => {
    it('should save client information', () => {
      const provider = new MobileOAuthProvider('test-hash')
      const clientInfo = { client_id: 'client-123', client_secret: 'secret' }

      provider.saveClientInformation(clientInfo as any)

      expect(storage.set).toHaveBeenCalledWith('mcp_oauth_test-hash_client', JSON.stringify(clientInfo))
    })

    it('should retrieve saved client information', () => {
      const provider = new MobileOAuthProvider('test-hash')
      const clientInfo = { client_id: 'client-123', client_secret: 'secret' }
      global.__mockStorageData.set('mcp_oauth_test-hash_client', JSON.stringify(clientInfo))

      expect(provider.clientInformation()).toEqual(clientInfo)
    })

    it('should return undefined when no client info stored', () => {
      const provider = new MobileOAuthProvider('test-hash')

      expect(provider.clientInformation()).toBeUndefined()
    })

    it('should handle corrupted client data gracefully', () => {
      const provider = new MobileOAuthProvider('test-hash')
      global.__mockStorageData.set('mcp_oauth_test-hash_client', 'corrupted{json')

      const result = provider.clientInformation()

      expect(result).toBeUndefined()
      expect(storage.delete).toHaveBeenCalledWith('mcp_oauth_test-hash_client')
    })
  })

  // ==================== Invalidate Credentials ====================
  describe('Invalidate Credentials', () => {
    beforeEach(() => {
      global.__mockStorageData.set('mcp_oauth_test-hash_tokens', 'tokens')
      global.__mockStorageData.set('mcp_oauth_test-hash_client', 'client')
      global.__mockStorageData.set('mcp_oauth_test-hash_verifier', 'verifier')
      global.__mockStorageData.set('mcp_oauth_test-hash_state', 'state')
    })

    it('should invalidate all credentials', () => {
      const provider = new MobileOAuthProvider('test-hash')

      provider.invalidateCredentials('all')

      expect(storage.delete).toHaveBeenCalledWith('mcp_oauth_test-hash_tokens')
      expect(storage.delete).toHaveBeenCalledWith('mcp_oauth_test-hash_client')
      expect(storage.delete).toHaveBeenCalledWith('mcp_oauth_test-hash_verifier')
      expect(storage.delete).toHaveBeenCalledWith('mcp_oauth_test-hash_state')
    })

    it('should invalidate only tokens', () => {
      const provider = new MobileOAuthProvider('test-hash')

      provider.invalidateCredentials('tokens')

      expect(storage.delete).toHaveBeenCalledWith('mcp_oauth_test-hash_tokens')
      expect(storage.delete).not.toHaveBeenCalledWith('mcp_oauth_test-hash_client')
    })

    it('should invalidate only client info', () => {
      const provider = new MobileOAuthProvider('test-hash')

      provider.invalidateCredentials('client')

      expect(storage.delete).toHaveBeenCalledWith('mcp_oauth_test-hash_client')
      expect(storage.delete).not.toHaveBeenCalledWith('mcp_oauth_test-hash_tokens')
    })

    it('should invalidate only verifier', () => {
      const provider = new MobileOAuthProvider('test-hash')

      provider.invalidateCredentials('verifier')

      expect(storage.delete).toHaveBeenCalledWith('mcp_oauth_test-hash_verifier')
    })

    it('should invalidate only state', () => {
      const provider = new MobileOAuthProvider('test-hash')

      provider.invalidateCredentials('state')

      expect(storage.delete).toHaveBeenCalledWith('mcp_oauth_test-hash_state')
    })
  })

  // ==================== redirectToAuthorization ====================
  describe('redirectToAuthorization', () => {
    it('should open browser for authorization', async () => {
      const provider = new MobileOAuthProvider('test-hash')
      global.__mockStorageData.set('mcp_oauth_test-hash_state', 'valid-state')

      const mockOpenAuth = WebBrowser.openAuthSessionAsync as jest.Mock
      mockOpenAuth.mockResolvedValue({
        type: 'success',
        url: 'cherry-studio://oauth/callback?code=auth-code&state=valid-state'
      })

      const authUrl = new URL('https://auth.example.com/authorize?state=valid-state')
      await provider.redirectToAuthorization(authUrl)

      expect(mockOpenAuth).toHaveBeenCalledWith(authUrl.toString(), 'cherry-studio://oauth/callback')
    })

    it('should throw error when OAuth is cancelled', async () => {
      const provider = new MobileOAuthProvider('test-hash')

      const mockOpenAuth = WebBrowser.openAuthSessionAsync as jest.Mock
      mockOpenAuth.mockResolvedValue({ type: 'cancel' })

      await expect(provider.redirectToAuthorization(new URL('https://auth.example.com/authorize'))).rejects.toThrow(
        'OAuth authorization was cancelled or failed'
      )
    })

    it('should throw error on state mismatch (CSRF protection)', async () => {
      const provider = new MobileOAuthProvider('test-hash')
      global.__mockStorageData.set('mcp_oauth_test-hash_state', 'expected-state')

      const mockOpenAuth = WebBrowser.openAuthSessionAsync as jest.Mock
      mockOpenAuth.mockResolvedValue({
        type: 'success',
        url: 'cherry-studio://oauth/callback?code=auth-code&state=wrong-state'
      })

      await expect(provider.redirectToAuthorization(new URL('https://auth.example.com/authorize'))).rejects.toThrow(
        'OAuth state mismatch - possible CSRF attack'
      )
    })

    it('should throw error when OAuth returns error', async () => {
      const provider = new MobileOAuthProvider('test-hash')
      global.__mockStorageData.set('mcp_oauth_test-hash_state', 'valid-state')

      const mockOpenAuth = WebBrowser.openAuthSessionAsync as jest.Mock
      mockOpenAuth.mockResolvedValue({
        type: 'success',
        url: 'cherry-studio://oauth/callback?error=access_denied&error_description=User+denied&state=valid-state'
      })

      await expect(provider.redirectToAuthorization(new URL('https://auth.example.com/authorize'))).rejects.toThrow(
        'OAuth authorization failed: User denied'
      )
    })

    it('should throw error when no code received', async () => {
      const provider = new MobileOAuthProvider('test-hash')
      global.__mockStorageData.set('mcp_oauth_test-hash_state', 'valid-state')

      const mockOpenAuth = WebBrowser.openAuthSessionAsync as jest.Mock
      mockOpenAuth.mockResolvedValue({
        type: 'success',
        url: 'cherry-studio://oauth/callback?state=valid-state'
      })

      await expect(provider.redirectToAuthorization(new URL('https://auth.example.com/authorize'))).rejects.toThrow(
        'No authorization code received from OAuth provider'
      )
    })
  })
})

// ==================== Helper Functions ====================
describe('Helper Functions', () => {
  beforeEach(() => {
    resetStorage()
  })

  describe('createMobileOAuthProvider', () => {
    it('should create provider with hashed server URL', () => {
      const provider = createMobileOAuthProvider('https://example.com/mcp')
      expect(provider).toBeInstanceOf(MobileOAuthProvider)
    })

    it('should create different providers for different URLs', () => {
      const provider1 = createMobileOAuthProvider('https://example1.com/mcp')
      const provider2 = createMobileOAuthProvider('https://example2.com/mcp')

      // They should be different instances
      expect(provider1).not.toBe(provider2)
    })
  })

  describe('hasOAuthTokens', () => {
    afterEach(() => {
      // Reset to default implementation after each test
      ;(storage.getString as jest.Mock).mockImplementation((key: string) => {
        return global.__mockStorageData?.get(key)
      })
    })

    it('should return true when valid tokens exist', () => {
      // Set tokens in mock storage - we need to use the actual hash
      const tokens = { access_token: 'test-token' }
      // hasOAuthTokens will use simpleHash internally, we set for any key ending in _tokens
      ;(storage.getString as jest.Mock).mockImplementation((key: string) => {
        if (key.endsWith('_tokens')) {
          return JSON.stringify(tokens)
        }
        return global.__mockStorageData?.get(key)
      })

      expect(hasOAuthTokens('https://example.com/mcp')).toBe(true)
    })

    it('should return false when no tokens exist', () => {
      // Reset mock to default behavior
      ;(storage.getString as jest.Mock).mockImplementation((key: string) => {
        return global.__mockStorageData?.get(key)
      })

      expect(hasOAuthTokens('https://example.com/mcp')).toBe(false)
    })

    it('should return false for corrupted token data', () => {
      ;(storage.getString as jest.Mock).mockImplementation((key: string) => {
        if (key.endsWith('_tokens')) {
          return 'invalid-json{'
        }
        return global.__mockStorageData?.get(key)
      })

      expect(hasOAuthTokens('https://example.com/mcp')).toBe(false)
    })

    it('should return false when access_token is missing', () => {
      ;(storage.getString as jest.Mock).mockImplementation((key: string) => {
        if (key.endsWith('_tokens')) {
          return JSON.stringify({ token_type: 'Bearer' })
        }
        return global.__mockStorageData?.get(key)
      })

      expect(hasOAuthTokens('https://example.com/mcp')).toBe(false)
    })
  })

  describe('clearOAuthTokens', () => {
    it('should delete tokens from storage', () => {
      clearOAuthTokens('https://example.com/mcp')

      expect(storage.delete).toHaveBeenCalled()
      // Verify it was called with a key ending in _tokens
      const deleteCall = (storage.delete as jest.Mock).mock.calls[0][0]
      expect(deleteCall).toMatch(/_tokens$/)
    })
  })
})

// ==================== performOAuthFlow ====================
describe('performOAuthFlow', () => {
  beforeEach(() => {
    resetStorage()
    global.fetch = jest.fn()
    // Reset storage.getString to default implementation
    ;(storage.getString as jest.Mock).mockImplementation((key: string) => {
      return global.__mockStorageData?.get(key)
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should throw error on invalid metadata response', async () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        // Missing required fields
        issuer: 'https://auth.example.com'
      })
    })

    await expect(performOAuthFlow('https://example.com/mcp')).rejects.toThrow('Invalid OAuth metadata')
  })

  it('should throw error when server does not support registration', async () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        issuer: 'https://auth.example.com',
        authorization_endpoint: 'https://auth.example.com/authorize',
        token_endpoint: 'https://auth.example.com/token'
        // No registration_endpoint
      })
    })

    await expect(performOAuthFlow('https://example.com/mcp')).rejects.toThrow(
      'OAuth server does not support dynamic client registration'
    )
  })

  it('should return false when user cancels OAuth', async () => {
    const mockFetch = global.fetch as jest.Mock
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          issuer: 'https://auth.example.com',
          authorization_endpoint: 'https://auth.example.com/authorize',
          token_endpoint: 'https://auth.example.com/token',
          registration_endpoint: 'https://auth.example.com/register'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          client_id: 'client-id',
          client_secret: 'secret'
        })
      })

    const mockOpenAuth = WebBrowser.openAuthSessionAsync as jest.Mock
    mockOpenAuth.mockResolvedValue({ type: 'cancel' })

    const result = await performOAuthFlow('https://example.com/mcp')

    expect(result).toBe(false)
  })
})

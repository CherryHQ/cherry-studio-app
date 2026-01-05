/**
 * MobileOAuthProvider - OAuth Client Provider for React Native
 *
 * Implements the OAuthClientProvider interface from @modelcontextprotocol/sdk
 * for mobile OAuth authentication using expo-web-browser and MMKV storage.
 *
 * This provider is designed to work with the forked @cherrystudio/react-native-streamable-http
 * transport that supports the authProvider option.
 */

import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens
} from '@modelcontextprotocol/sdk/shared/auth.js'
import * as Crypto from 'expo-crypto'
import * as WebBrowser from 'expo-web-browser'
import { z } from 'zod'

import { loggerService } from '@/services/LoggerService'
import { storage, uuid } from '@/utils'

const logger = loggerService.withContext('MCP:OAuth')

// ==================== OAuth Types ====================

const OAuthMetadataSchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  registration_endpoint: z.string().url().optional(),
  scopes_supported: z.array(z.string()).optional(),
  response_types_supported: z.array(z.string()).optional(),
  code_challenge_methods_supported: z.array(z.string()).optional()
})

type OAuthMetadata = z.infer<typeof OAuthMetadataSchema>

const OAuthClientInfoSchema = z.object({
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  client_id_issued_at: z.number().optional(),
  client_secret_expires_at: z.number().optional()
})

const OAuthTokensSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional()
})

// ==================== PKCE Helper Functions ====================

/**
 * Generate a cryptographically secure code verifier for PKCE
 */
function generateCodeVerifier(): string {
  const array = Crypto.getRandomBytes(32)
  return base64UrlEncode(array)
}

/**
 * Generate code challenge from verifier using SHA-256
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data)
  return base64UrlEncode(new Uint8Array(digest))
}

/**
 * Base64 URL encode (no padding, URL-safe characters)
 */
function base64UrlEncode(buffer: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i])
  }
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ==================== OAuth Discovery & Registration ====================

/**
 * Discover OAuth metadata from server
 */
async function discoverOAuthMetadata(serverUrl: string): Promise<OAuthMetadata> {
  const url = new URL(serverUrl)
  const metadataUrl = `${url.origin}/.well-known/oauth-authorization-server`

  logger.info(`Discovering OAuth metadata from: ${metadataUrl}`)

  const response = await fetch(metadataUrl)
  if (!response.ok) {
    throw new Error(`Failed to discover OAuth metadata: ${response.status}`)
  }

  const rawMetadata = await response.json()
  const parseResult = OAuthMetadataSchema.safeParse(rawMetadata)

  if (!parseResult.success) {
    const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
    logger.error(`Invalid OAuth metadata from server: ${errors}`)
    throw new Error(`Invalid OAuth metadata: ${errors}`)
  }

  logger.info('OAuth metadata discovered and validated successfully')
  return parseResult.data
}

/**
 * Register OAuth client dynamically
 */
async function registerOAuthClient(
  registrationEndpoint: string,
  clientMetadata: OAuthClientMetadata
): Promise<OAuthClientInformationFull> {
  logger.info('Registering OAuth client dynamically')

  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(clientMetadata)
  })

  if (!response.ok) {
    throw new Error(`Failed to register OAuth client: ${response.status}`)
  }

  const rawClientInfo = await response.json()
  const parseResult = OAuthClientInfoSchema.safeParse(rawClientInfo)

  if (!parseResult.success) {
    const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
    logger.error(`Invalid client registration response: ${errors}`)
    throw new Error(`Invalid client registration response: ${errors}`)
  }

  logger.info('OAuth client registered successfully')
  return rawClientInfo as OAuthClientInformationFull
}

/**
 * Build authorization URL with PKCE parameters
 */
function buildAuthorizationUrl(
  metadata: OAuthMetadata,
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string
): string {
  const url = new URL(metadata.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('state', state)

  if (metadata.scopes_supported?.length) {
    url.searchParams.set('scope', metadata.scopes_supported.join(' '))
  }

  return url.toString()
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  tokenEndpoint: string,
  code: string,
  clientId: string,
  codeVerifier: string,
  redirectUri: string
): Promise<OAuthTokens> {
  logger.info('Exchanging authorization code for tokens')

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: codeVerifier
    }).toString()
  })

  if (!response.ok) {
    const errorText = await response.text()
    logger.error(`Token exchange failed: ${response.status} - ${errorText}`)
    throw new Error(`Token exchange failed: ${response.status}`)
  }

  const rawTokens = await response.json()
  const parseResult = OAuthTokensSchema.safeParse(rawTokens)

  if (!parseResult.success) {
    const errors = parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
    logger.error(`Invalid token response: ${errors}`)
    throw new Error(`Invalid token response: ${errors}`)
  }

  logger.info('Token exchange successful')
  return rawTokens as OAuthTokens
}

const STORAGE_PREFIX = 'mcp_oauth_'
const REDIRECT_URL = 'cherry-studio://oauth/callback'

/**
 * Mobile OAuth Provider for MCP servers
 *
 * Implements the OAuthClientProvider interface required by the MCP SDK.
 * Uses MMKV for secure token storage and expo-web-browser for OAuth flows.
 *
 * @example
 * ```typescript
 * const provider = new MobileOAuthProvider(serverHash)
 * const transport = new RNStreamableHTTPClientTransport(url, { authProvider: provider })
 * ```
 */
export class MobileOAuthProvider implements OAuthClientProvider {
  private serverHash: string

  constructor(serverHash: string) {
    this.serverHash = serverHash
  }

  // ==================== Storage Keys ====================

  private get tokensKey(): string {
    return `${STORAGE_PREFIX}${this.serverHash}_tokens`
  }

  private get clientInfoKey(): string {
    return `${STORAGE_PREFIX}${this.serverHash}_client`
  }

  private get verifierKey(): string {
    return `${STORAGE_PREFIX}${this.serverHash}_verifier`
  }

  private get stateKey(): string {
    return `${STORAGE_PREFIX}${this.serverHash}_state`
  }

  // ==================== OAuthClientProvider Interface ====================

  /**
   * The URL to redirect the user agent to after authorization
   */
  get redirectUrl(): string {
    return REDIRECT_URL
  }

  /**
   * OAuth client metadata for dynamic registration
   */
  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Cherry Studio App'
    } as OAuthClientMetadata
  }

  /**
   * Load client information from storage
   */
  clientInformation(): OAuthClientInformationFull | undefined {
    const data = storage.getString(this.clientInfoKey)
    if (!data) return undefined

    try {
      return JSON.parse(data) as OAuthClientInformationFull
    } catch (error) {
      logger.error('Corrupted client information in storage, clearing', error as Error)
      storage.delete(this.clientInfoKey)
      return undefined
    }
  }

  /**
   * Save client information to storage
   */
  saveClientInformation(info: OAuthClientInformationFull): void {
    storage.set(this.clientInfoKey, JSON.stringify(info))
    logger.verbose('Saved client information')
  }

  /**
   * Load OAuth tokens from storage
   */
  tokens(): OAuthTokens | undefined {
    const data = storage.getString(this.tokensKey)
    if (!data) return undefined

    try {
      return JSON.parse(data) as OAuthTokens
    } catch (error) {
      logger.error('Corrupted OAuth tokens in storage, clearing', error as Error)
      storage.delete(this.tokensKey)
      return undefined
    }
  }

  /**
   * Save OAuth tokens to storage
   */
  saveTokens(tokens: OAuthTokens): void {
    storage.set(this.tokensKey, JSON.stringify(tokens))
    logger.info('Saved OAuth tokens')
  }

  /**
   * Redirect user to authorization URL using expo-web-browser
   *
   * This method is called by the SDK's auth() function to start the OAuth flow.
   * It opens a web browser session that will redirect back to our app with the
   * authorization code.
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    logger.info('Opening authorization URL in browser')

    const result = await WebBrowser.openAuthSessionAsync(authorizationUrl.toString(), this.redirectUrl)

    if (result.type !== 'success') {
      logger.warn(`OAuth flow ended with type: ${result.type}`)
      throw new Error(`OAuth authorization was cancelled or failed: ${result.type}`)
    }

    // Parse the callback URL to extract the authorization code
    const callbackUrl = new URL(result.url)
    const code = callbackUrl.searchParams.get('code')
    const error = callbackUrl.searchParams.get('error')
    const returnedState = callbackUrl.searchParams.get('state')

    // Verify state parameter for CSRF protection
    if (!returnedState || !this.verifyState(returnedState)) {
      throw new Error('OAuth state mismatch - possible CSRF attack')
    }

    if (error) {
      const errorDescription = callbackUrl.searchParams.get('error_description') || error
      logger.error(`OAuth error: ${errorDescription}`)
      throw new Error(`OAuth authorization failed: ${errorDescription}`)
    }

    if (!code) {
      logger.error('No authorization code in callback URL')
      throw new Error('No authorization code received from OAuth provider')
    }

    logger.info('Received authorization code from OAuth provider')

    // Note: The SDK's auth() function will extract the code from the redirect URL
    // and call exchangeAuthorization() to get the tokens.
    // We need to store the callback URL so the SDK can access it.
    // The SDK expects redirectToAuthorization to return after the user completes auth.
    // The code will be extracted from the URL by the SDK.
  }

  /**
   * Save PKCE code verifier to storage
   */
  saveCodeVerifier(codeVerifier: string): void {
    storage.set(this.verifierKey, codeVerifier)
    logger.verbose('Saved PKCE code verifier')
  }

  /**
   * Load PKCE code verifier from storage
   * @throws Error if verifier is not found (indicates OAuth flow was not started properly)
   */
  codeVerifier(): string {
    const verifier = storage.getString(this.verifierKey)
    if (!verifier) {
      logger.error('PKCE code verifier not found in storage')
      throw new Error('PKCE code verifier not found. Please restart the OAuth flow.')
    }
    return verifier
  }

  /**
   * Generate OAuth state parameter for CSRF protection
   * Saves the state to storage for later verification
   */
  state(): string {
    const newState = uuid()
    storage.set(this.stateKey, newState)
    logger.verbose('Generated and saved OAuth state')
    return newState
  }

  /**
   * Verify the returned state parameter matches the stored state
   * This is critical for CSRF protection
   *
   * @param returnedState - The state parameter returned from the OAuth callback
   * @returns true if the state matches, false otherwise
   */
  verifyState(returnedState: string): boolean {
    const expectedState = storage.getString(this.stateKey)
    if (!expectedState) {
      logger.error('No stored state found for verification')
      return false
    }
    const isValid = returnedState === expectedState
    if (!isValid) {
      logger.error('OAuth state mismatch - possible CSRF attack')
    }
    return isValid
  }

  /**
   * Invalidate stored credentials
   */
  invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'state'): void {
    switch (scope) {
      case 'all':
        storage.delete(this.tokensKey)
        storage.delete(this.clientInfoKey)
        storage.delete(this.verifierKey)
        storage.delete(this.stateKey)
        logger.info('Invalidated all OAuth credentials')
        break
      case 'tokens':
        storage.delete(this.tokensKey)
        logger.info('Invalidated OAuth tokens')
        break
      case 'client':
        storage.delete(this.clientInfoKey)
        logger.info('Invalidated OAuth client information')
        break
      case 'verifier':
        storage.delete(this.verifierKey)
        logger.info('Invalidated PKCE code verifier')
        break
      case 'state':
        storage.delete(this.stateKey)
        logger.info('Invalidated OAuth state')
        break
    }
  }
}

/**
 * Create a MobileOAuthProvider for a given server URL
 *
 * @param serverUrl - The MCP server URL to create a provider for
 * @returns A MobileOAuthProvider instance
 */
export function createMobileOAuthProvider(serverUrl: string): MobileOAuthProvider {
  // Create a hash of the server URL for storage keys
  const hash = simpleHash(serverUrl)
  return new MobileOAuthProvider(hash)
}

/**
 * Simple hash function for creating storage keys
 * Uses a basic djb2 hash algorithm for consistency
 */
function simpleHash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Check if a server has valid OAuth tokens stored
 *
 * @param serverUrl - The MCP server URL to check
 * @returns true if valid tokens exist, false otherwise
 */
export function hasOAuthTokens(serverUrl: string): boolean {
  const hash = simpleHash(serverUrl)
  const tokensKey = `${STORAGE_PREFIX}${hash}_tokens`
  const data = storage.getString(tokensKey)

  if (!data) return false

  try {
    const tokens = JSON.parse(data) as OAuthTokens
    return !!tokens.access_token
  } catch {
    return false
  }
}

/**
 * Clear OAuth tokens for a server
 *
 * @param serverUrl - The MCP server URL to clear tokens for
 */
export function clearOAuthTokens(serverUrl: string): void {
  const hash = simpleHash(serverUrl)
  const tokensKey = `${STORAGE_PREFIX}${hash}_tokens`
  storage.delete(tokensKey)
  logger.info('Cleared OAuth tokens for server')
}

/**
 * Perform the complete OAuth flow for an MCP server
 *
 * This function handles:
 * 1. OAuth metadata discovery
 * 2. Dynamic client registration (if needed)
 * 3. PKCE code generation
 * 4. Opening browser for authorization
 * 5. Exchanging authorization code for tokens
 * 6. Saving tokens to storage
 *
 * @param serverUrl - The MCP server URL to authenticate with
 * @returns true if OAuth was successful, false otherwise
 */
export async function performOAuthFlow(serverUrl: string): Promise<boolean> {
  const provider = createMobileOAuthProvider(serverUrl)

  try {
    // 1. Discover OAuth metadata
    logger.info(`Starting OAuth flow for: ${serverUrl}`)
    const metadata = await discoverOAuthMetadata(serverUrl)

    // 2. Get or register client
    let clientInfo = provider.clientInformation()
    if (!clientInfo) {
      if (!metadata.registration_endpoint) {
        throw new Error('OAuth server does not support dynamic client registration')
      }
      clientInfo = await registerOAuthClient(metadata.registration_endpoint, provider.clientMetadata)
      provider.saveClientInformation(clientInfo)
    }

    // 3. Generate PKCE
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    provider.saveCodeVerifier(codeVerifier)

    // 4. Build authorization URL
    const state = provider.state()
    const authUrl = buildAuthorizationUrl(metadata, clientInfo.client_id, provider.redirectUrl, codeChallenge, state)

    // 5. Open browser and wait for callback
    logger.info('Opening browser for OAuth authorization')
    const result = await WebBrowser.openAuthSessionAsync(authUrl, provider.redirectUrl)

    if (result.type !== 'success') {
      logger.warn(`OAuth flow ended with type: ${result.type}`)
      return false
    }

    // 6. Extract authorization code from callback URL
    const callbackUrl = new URL(result.url)
    const code = callbackUrl.searchParams.get('code')
    const error = callbackUrl.searchParams.get('error')
    const returnedState = callbackUrl.searchParams.get('state')

    // Verify state parameter for CSRF protection
    if (!returnedState || !provider.verifyState(returnedState)) {
      throw new Error('OAuth state mismatch - possible CSRF attack')
    }

    if (error) {
      const errorDescription = callbackUrl.searchParams.get('error_description') || error
      logger.error(`OAuth error: ${errorDescription}`)
      throw new Error(`OAuth authorization failed: ${errorDescription}`)
    }

    if (!code) {
      logger.error('No authorization code in callback URL')
      throw new Error('No authorization code received from OAuth provider')
    }

    // 7. Exchange code for tokens
    const tokens = await exchangeCodeForTokens(
      metadata.token_endpoint,
      code,
      clientInfo.client_id,
      codeVerifier,
      provider.redirectUrl
    )

    // 8. Save tokens
    provider.saveTokens(tokens)
    logger.info('OAuth flow completed successfully')

    return true
  } catch (error) {
    logger.error('OAuth flow failed:', error as Error)
    throw error
  }
}

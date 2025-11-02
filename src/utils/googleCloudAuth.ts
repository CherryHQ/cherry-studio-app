/**
 * Google Cloud authentication utilities for React Native
 * Generates OAuth 2.0 JWT tokens for service account authentication
 */

import { Buffer } from 'buffer'
import crypto from 'react-native-quick-crypto'

import { loggerService } from '@/services/LoggerService'

const logger = loggerService.withContext('GoogleCloudAuth')

interface ServiceAccount {
  privateKey: string
  clientEmail: string
}

/**
 * Generate a JWT token for Google Cloud service account authentication
 */
function generateJWT(serviceAccount: ServiceAccount, scopes: string[]): string {
  const { privateKey, clientEmail } = serviceAccount

  const now = Math.floor(Date.now() / 1000)
  const expiry = now + 3600 // 1 hour from now

  // JWT Header
  const header = {
    alg: 'RS256',
    typ: 'JWT'
  }

  // JWT Claim Set
  const claimSet = {
    iss: clientEmail,
    scope: scopes.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    exp: expiry,
    iat: now
  }

  // Encode header and claim set
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet))

  // Create signature input
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`

  // Sign with private key
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signatureInput)

  const signature = sign.sign({key: privateKey})
  const encodedSignature = base64UrlEncode(signature)

  return `${signatureInput}.${encodedSignature}`
}

/**
 * Base64 URL encode (without padding)
 */
function base64UrlEncode(data: string | Buffer): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Exchange JWT for an access token
 */
async function exchangeJwtForAccessToken(jwt: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to exchange JWT for access token: ${error}`)
  }

  const data = await response.json()
  return data.access_token
}

/**
 * Generate Google Cloud access token from service account credentials
 */
export async function generateGoogleCloudAccessToken(
  serviceAccount: ServiceAccount,
  scopes: string[] = ['https://www.googleapis.com/auth/cloud-platform']
): Promise<string> {
  try {
    const jwt = generateJWT(serviceAccount, scopes)
    const accessToken = await exchangeJwtForAccessToken(jwt)
    return accessToken
  } catch (error) {
    logger.error('Failed to generate Google Cloud access token:', error as Error)
    throw error
  }
}

/**
 * Generate authorization headers for Google Cloud API requests
 */
export async function generateGoogleCloudAuthHeaders(
  serviceAccount: ServiceAccount
): Promise<Record<string, string>> {
  const accessToken = await generateGoogleCloudAccessToken(serviceAccount)
  return {
    Authorization: `Bearer ${accessToken}`
  }
}

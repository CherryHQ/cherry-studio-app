import { trim } from 'lodash'

/**
 * Matches a version segment in a path that starts with `/v<number>` and optionally
 * continues with `alpha` or `beta`. The segment may be followed by `/` or the end
 * of the string (useful for cases like `/v3alpha/resources`).
 */
const VERSION_REGEX_PATTERN = '\\/v\\d+(?:alpha|beta)?(?=\\/|$)'

/**
 * Checks whether the path of the host contains a version-like string (e.g., /v1, /v2beta, etc.).
 *
 * @param host - The host or path string to check
 * @returns Returns true if the path contains a version string, otherwise false
 */
export function hasAPIVersion(host?: string): boolean {
  if (!host) return false

  const regex = new RegExp(VERSION_REGEX_PATTERN, 'i')

  try {
    const url = new URL(host)
    return regex.test(url.pathname)
  } catch {
    // If it cannot be parsed as a complete URL, treat it as a path directly for detection
    return regex.test(host)
  }
}

/**
 * Removes the trailing slash from a URL string if it exists.
 *
 * @template T - The string type to preserve type safety
 * @param {T} url - The URL string to process
 * @returns {T} The URL string without a trailing slash
 *
 * @example
 * ```ts
 * withoutTrailingSlash('https://example.com/') // 'https://example.com'
 * withoutTrailingSlash('https://example.com')  // 'https://example.com'
 * ```
 */
export function withoutTrailingSlash<T extends string>(url: T): T {
  return url.replace(/\/$/, '') as T
}

/**
 * Removes the trailing '#' from a URL string if it exists.
 *
 * @template T - The string type to preserve type safety
 * @param {T} url - The URL string to process
 * @returns {T} The URL string without a trailing '#'
 *
 * @example
 * ```ts
 * withoutTrailingSharp('https://example.com#') // 'https://example.com'
 * withoutTrailingSharp('https://example.com')  // 'https://example.com'
 * ```
 */
export function withoutTrailingSharp<T extends string>(url: T): T {
  return url.replace(/#$/, '') as T
}

/**
 * Formats an API host URL by normalizing it and optionally appending an API version.
 *
 * @param host - The API host URL to format. Leading/trailing whitespace will be trimmed and trailing slashes removed.
 * @param supportApiVersion - Whether the API version is supported. Defaults to `true`.
 * @param apiVersion - The API version to append if needed. Defaults to `'v1'`.
 *
 * @returns The formatted API host URL. If the host is empty after normalization, returns an empty string.
 *          If the host ends with '#', API version is not supported, or the host already contains a version, returns the normalized host with trailing '#' removed.
 *          Otherwise, returns the host with the API version appended.
 *
 * @example
 * formatApiHost('https://api.example.com/') // Returns 'https://api.example.com/v1'
 * formatApiHost('https://api.example.com#') // Returns 'https://api.example.com'
 * formatApiHost('https://api.example.com/v2', true, 'v1') // Returns 'https://api.example.com/v2'
 */
export function formatApiHost(host?: string, supportApiVersion: boolean = true, apiVersion: string = 'v1'): string {
  const normalizedHost = withoutTrailingSlash(trim(host))
  if (!normalizedHost) {
    return ''
  }

  const shouldAppendApiVersion = !(normalizedHost.endsWith('#') || !supportApiVersion || hasAPIVersion(normalizedHost))

  if (shouldAppendApiVersion) {
    return `${normalizedHost}/${apiVersion}`
  } else {
    return withoutTrailingSharp(normalizedHost)
  }
}

/**
 * API key 脱敏函数。仅保留部分前后字符，中间用星号代替。
 *
 * - 长度大于 24，保留前、后 8 位。
 * - 长度大于 16，保留前、后 4 位。
 * - 长度大于 8，保留前、后 2 位。
 * - 其余情况，返回原始密钥。
 *
 * @param {string} key - 需要脱敏的 API 密钥。
 * @returns {string} 脱敏后的密钥字符串。
 */
export function maskApiKey(key: string): string {
  if (!key) return ''

  if (key.length > 24) {
    return `${key.slice(0, 8)}****${key.slice(-8)}`
  } else if (key.length > 16) {
    return `${key.slice(0, 4)}****${key.slice(-4)}`
  } else if (key.length > 8) {
    return `${key.slice(0, 2)}****${key.slice(-2)}`
  } else {
    return key
  }
}

/**
 * 将 API key 字符串转换为 key 数组。
 *
 * @param {string} keyStr - 包含 API key 的逗号分隔字符串。
 * @returns {string[]} 转换后的数组，每个元素为 API key。
 */
export function splitApiKeyString(keyStr: string): string[] {
  return keyStr
    .split(/(?<!\\),/)
    .map(k => k.trim())
    .map(k => k.replace(/\\,/g, ','))
    .filter(k => k)
}

// 目前对话界面只支持这些端点
export const SUPPORTED_IMAGE_ENDPOINT_LIST = ['images/generations', 'images/edits', 'predict'] as const
export const SUPPORTED_ENDPOINT_LIST = [
  'chat/completions',
  'responses',
  'messages',
  'generateContent',
  'streamGenerateContent',
  ...SUPPORTED_IMAGE_ENDPOINT_LIST
] as const

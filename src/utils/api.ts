const VERSION_SEGMENT_RE = /^v\d+(?:[a-z]+\d*)?$/i

function hasVersionSegment(host: string, apiVersion: string): boolean {
  try {
    const segments = new URL(host).pathname.split('/').filter(Boolean)
    return segments.some(segment => segment === apiVersion || VERSION_SEGMENT_RE.test(segment))
  } catch {
    return host.includes(`/${apiVersion}`) || VERSION_SEGMENT_RE.test(host.split('/').filter(Boolean).at(-1) ?? '')
  }
}

/**
 * 格式化 API 主机地址。
 *
 * - host 以 `/` 结尾 → 原样返回
 * - 路径中已包含版本段（如 `v1`、`v4`、`v1beta`）→ 只补尾部 `/`
 * - 其余情况 → 追加 `/${apiVersion}/`
 *
 * @param {string} host - 需要格式化的 API 主机地址。
 * @param {string} apiVersion - 需要追加的 API 版本，默认 `v1`。
 * @returns {string} 格式化后的 API 主机地址。
 */
export function formatApiHost(host: string, apiVersion: string = 'v1'): string {
  if (!host || host.endsWith('/')) {
    return host
  }

  if (hasVersionSegment(host, apiVersion)) {
    return `${host}/`
  }

  return `${host}/${apiVersion}/`
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

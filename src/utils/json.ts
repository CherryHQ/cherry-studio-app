import { loggerService } from '@/services/LoggerService'
const logger = loggerService.withContext('Utils Json')

/**
 * 判断字符串是否是 json 字符串
 * @param {any} str 字符串
 * @returns {boolean} 是否为 json 字符串
 */
export function isJSON(str: any): boolean {
  if (typeof str !== 'string') {
    return false
  }

  try {
    return typeof JSON.parse(str) === 'object'
  } catch {
    return false
  }
}

/**
 * 尝试解析 JSON 字符串，如果解析失败则返回 null。
 * @param {string} str 要解析的字符串
 * @returns {any | null} 解析后的对象，解析失败返回 null
 */
export function parseJSON(str: string): any | null {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

/**
 * 尝试将JSON 字符串转换为 对象，如果转换失败则返回 defaultValue(默认为 undefined)。
 * @param {string} jsonString 要转换的 JSON 字符串
 * @returns {string | null} 转换后的 对象，转换失败返回 defaultValue
 */
export const safeJsonParse = (jsonString: string | null, defaultValue: any = undefined) => {
  if (typeof jsonString !== 'string') {
    return defaultValue
  }

  try {
    return JSON.parse(jsonString)
  } catch (e) {
    logger.error('JSON parse error for string:', e, jsonString)
    return defaultValue
  }
}

/**
 * 格式化数据为 JSON 字符串，用于显示
 * @param data 要格式化的数据
 * @returns 格式化后的 JSON 字符串
 */
export function formatJson(data: any): string {
  try {
    return JSON.stringify(data, null, 2) ?? '{}'
  } catch {
    return '{}'
  }
}

export interface TruncatedJson {
  text: string
  isTruncated: boolean
  fullText: string
}

/**
 * 格式化并截断 JSON 数据，用于大数据显示优化
 * @param data 要格式化的数据
 * @param maxLines 最大显示行数，默认 50
 * @param maxChars 最大显示字符数，默认 2000
 * @returns 截断结果，包含显示文本、是否截断、完整文本
 */
export function truncateFormattedJson(data: any, maxLines = 50, maxChars = 2000): TruncatedJson {
  const fullText = formatJson(data)

  if (fullText.length <= maxChars) {
    const lines = fullText.split('\n')
    if (lines.length <= maxLines) {
      return { text: fullText, isTruncated: false, fullText }
    }
  }

  const lines = fullText.split('\n')
  let truncatedText: string

  if (lines.length > maxLines) {
    truncatedText = lines.slice(0, maxLines).join('\n')
  } else {
    truncatedText = fullText.slice(0, maxChars)
  }

  // 确保不超过字符限制
  if (truncatedText.length > maxChars) {
    truncatedText = truncatedText.slice(0, maxChars)
  }

  return { text: truncatedText, isTruncated: true, fullText }
}

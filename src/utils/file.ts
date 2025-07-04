import { audioExts, documentExts, imageExts, KB, MB, textExts, videoExts } from '@/constants'
import { FileTypes } from '@/types/file'

/**
 * 格式化文件大小，根据大小返回以 MB 或 KB 为单位的字符串。
 * @param {number} size 文件大小（字节）
 * @returns {string} 格式化后的文件大小字符串
 */
export function formatFileSize(size: number): string {
  if (size >= MB) {
    return (size / MB).toFixed(1) + ' MB'
  }

  if (size >= KB) {
    return (size / KB).toFixed(0) + ' KB'
  }

  return (size / KB).toFixed(2) + ' KB'
}

export function getFileTypeMap(): Map<string, FileTypes> {
  const fileTypeMap = new Map<string, FileTypes>()
  imageExts.forEach(ext => fileTypeMap.set(ext, FileTypes.IMAGE))
  videoExts.forEach(ext => fileTypeMap.set(ext, FileTypes.VIDEO))
  audioExts.forEach(ext => fileTypeMap.set(ext, FileTypes.AUDIO))
  textExts.forEach(ext => fileTypeMap.set(ext, FileTypes.TEXT))
  documentExts.forEach(ext => fileTypeMap.set(ext, FileTypes.DOCUMENT))
  return fileTypeMap
}

export function getFileType(ext: string): FileTypes {
  ext = `.${ext.toLowerCase()}`
  const fileTypeMap = getFileTypeMap()
  return fileTypeMap.get(ext) || FileTypes.OTHER
}

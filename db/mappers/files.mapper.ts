import type { FileMetadata } from '@/types/file'

/**
 * 将数据库记录转换为 File 类型。
 * @param dbRecord - 从数据库检索的记录。
 * @returns 一个 File 对象。
 */
export function transformDbToFile(dbRecord: any): FileMetadata {
  return {
    id: dbRecord.id,
    origin_name: dbRecord.origin_name,
    created_at: dbRecord.created_at,
    name: dbRecord.name,
    path: dbRecord.path,
    size: dbRecord.size,
    ext: dbRecord.ext,
    count: dbRecord.count,
    type: dbRecord.type
  }
}

/**
 * 将 File 对象转换为数据库记录格式。
 * @param File - File 对象。
 * @returns 一个适合数据库操作的对象。
 */
export function transformFileToDb(file: FileMetadata) {
  return {
    id: file.id,
    origin_name: file.origin_name,
    created_at: file.created_at,
    name: file.name,
    path: file.path,
    size: file.size,
    ext: file.ext,
    count: file.count,
    type: file.type
  }
}

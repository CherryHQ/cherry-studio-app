import { eq } from 'drizzle-orm'

import { FileType } from '@/types/file'

import { db } from '..'
import { files } from '../schema'

/**
 * 将数据库记录转换为 File 类型。
 * @param dbRecord - 从数据库检索的记录。
 * @returns 一个 File 对象。
 */
export function transformDbToFile(dbRecord: FileType): FileType {
  return {
    id: dbRecord.id,
    origin_name: dbRecord.origin_name,
    created_at: dbRecord.created_at,
    name: dbRecord.name,
    path: dbRecord.path,
    size: dbRecord.size,
    ext: dbRecord.ext,
    count: dbRecord.count,
    type: dbRecord.type,
    mime_type: dbRecord.mime_type,
    md5: dbRecord.md5
  }
}

/**
 * 将 File 对象转换为数据库记录格式。
 * @param File - File 对象。
 * @returns 一个适合数据库操作的对象。
 */
function transformFileToDb(file: FileType) {
  return {
    id: file.id,
    origin_name: file.origin_name,
    created_at: file.created_at,
    name: file.name,
    path: file.path,
    size: file.size,
    ext: file.ext,
    count: file.count,
    type: file.type,
    md5: file.md5,
    mime_type: file.mime_type
  }
}

/**
 * 返回所有文件
 * @returns 文件数组
 */
export async function getAllFiles(): Promise<FileType[] | null> {
  try {
    const result = (await db.select().from(files)) as FileType[]

    if (result.length === 0) {
      return null
    }

    return result.map(transformDbToFile)
  } catch (error) {
    console.error('Error getting all files:', error)
    throw error
  }
}

/**
 * 根据id获取文件
 * @param id 文件的id
 * @returns 返回一个文件对象
 * @description 根据id获取文件
 */
export async function getFileById(id: string): Promise<FileType | null> {
  try {
    const result = (await db.select().from(files).where(eq(files.id, id)).limit(1)) as FileType[]

    if (result.length === 0) {
      return null
    }

    return transformDbToFile(result[0])
  } catch (error) {
    console.error('Error getting file by ID:', error)
    throw error
  }
}

/**
 * 插入或更新单个文件(仅供内部使用)
 * @param filesToUpsert 要插入或更新的单个文件。
 * @returns 无返回值。
 * @description 此函数将尝试插入或更新助手记录到数据库中。
 */
async function upsertFile(filesToUpsert: FileType, allFilesMeta?: Pick<FileType, 'md5' | 'count'>[]) {
  try {
    const dbRecord = transformFileToDb(filesToUpsert)

    const _allFilesMeta = allFilesMeta || (await getAllFiles())?.map(item => ({ md5: item.md5, count: item.count }))
    const existFile = _allFilesMeta?.find(item => item.md5 === filesToUpsert.md5)

    if (existFile)
      return db
        .insert(files)
        .values(dbRecord)
        .onConflictDoUpdate({
          target: [files.id],
          set: { ...dbRecord, count: existFile.count + 1 }
        })

    return db
      .insert(files)
      .values(dbRecord)
      .onConflictDoUpdate({
        target: [files.id],
        set: dbRecord
      })
  } catch (error) {
    console.error('Error upserting file:', error)
    throw error
  }
}

/**
 * 插入或更新多个文件
 * @param filesToUpsert 要插入或更新的多个文件。
 * @returns 无返回值。
 * @description 此函数将尝试插入或更新助手记录到数据库中。
 */
export async function upsertFiles(filesToUpsert: FileType[]) {
  try {
    const allFilesMeta = (await getAllFiles())?.map(item => ({ md5: item.md5, count: item.count }))
    const upsertPromises = filesToUpsert.map(self => upsertFile(self, allFilesMeta))
    await Promise.all(upsertPromises)
  } catch (error) {
    console.error('Error upserting files:', error)
    throw error
  }
}

/**
 *
 * @param fileId 文件的id
 * @returns 无返回值
 * @description 根据id删除文件
 */
export async function deleteFileById(fileId: string) {
  try {
    return await db.delete(files).where(eq(files.id, fileId))
  } catch (error) {
    console.error('Error deleting file by ID:', error)
    throw error
  }
}

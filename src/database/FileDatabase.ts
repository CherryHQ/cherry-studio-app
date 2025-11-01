import {
  deleteFileById as _deleteFileById,
  getAllFiles as _getAllFiles,
  getFileById as _getFileById,
  upsertFiles as _upsertFiles
} from '@db/queries/files.queries'

import type { FileMetadata } from '@/types/file'

export async function upsertFiles(files: FileMetadata[]) {
  return _upsertFiles(files)
}

export async function deleteFileById(fileId: string) {
  return _deleteFileById(fileId)
}

export async function getAllFiles() {
  return _getAllFiles()
}

export async function getFileById(id: string) {
  return _getFileById(id)
}

export const fileDatabase = {
  upsertFiles,
  deleteFileById,
  getAllFiles,
  getFileById
}

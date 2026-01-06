import { fileDatabase } from '@database'
import { Directory, File, Paths } from 'expo-file-system'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'

import { DEFAULT_DOCUMENTS_STORAGE, DEFAULT_IMAGES_STORAGE, DEFAULT_STORAGE } from '@/constants/storage'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'
import { FileTypes } from '@/types/file'
import { uuid } from '@/utils'
import { normalizeExtension } from '@/utils/file'

export interface ShareFileResult {
  success: boolean
  message: string
  savedUri?: string
}

const logger = loggerService.withContext('File Service')
const { getAllFiles, getFileById } = fileDatabase

// 辅助函数，确保目录存在
async function ensureDirExists(dir: Directory) {
  const dirInfo = dir.info()

  if (!dirInfo.exists) {
    dir.create({ intermediates: true })
  }
}

export function readFile(file: FileMetadata): string {
  return new File(file.path).textSync()
}

export function readBase64File(file: FileMetadata): string {
  return new File(file.path).base64Sync()
}

export async function writeBase64File(data: string): Promise<FileMetadata> {
  if (!DEFAULT_IMAGES_STORAGE.exists) {
    DEFAULT_IMAGES_STORAGE.create({ intermediates: true, overwrite: true })
  }

  const cleanedBase64 = data.includes('data:image') ? data.split(',')[1] : data

  const fileName = uuid()
  const fileUri = DEFAULT_IMAGES_STORAGE.uri + `${fileName}.png`

  // Use legacy API to write base64 data directly
  await FileSystem.writeAsStringAsync(fileUri, cleanedBase64, {
    encoding: FileSystem.EncodingType.Base64
  })

  const file = new File(fileUri)

  return {
    id: fileName,
    name: fileName,
    origin_name: fileName,
    path: fileUri,
    size: file.size,
    ext: '.png',
    type: FileTypes.IMAGE,
    created_at: Date.now(),
    count: 1
  }
}

export async function saveTextAsFile(text: string, fileName?: string): Promise<FileMetadata> {
  await ensureDirExists(DEFAULT_DOCUMENTS_STORAGE)

  const fileId = uuid()
  const finalFileName = fileName || `pasted-text-${Date.now()}`
  const fileUri = DEFAULT_DOCUMENTS_STORAGE.uri + `${fileId}.txt`

  // Write text to file
  await FileSystem.writeAsStringAsync(fileUri, text, {
    encoding: FileSystem.EncodingType.UTF8
  })

  const file = new File(fileUri)

  const fileMetadata: FileMetadata = {
    id: fileId,
    name: finalFileName,
    origin_name: `${finalFileName}.txt`,
    path: fileUri,
    size: file.size,
    ext: '.txt',
    type: FileTypes.DOCUMENT,
    created_at: Date.now(),
    count: 1
  }

  // Save to database
  fileDatabase.upsertFiles([fileMetadata])

  return fileMetadata
}

export function readStreamFile(file: FileMetadata): ReadableStream {
  return new File(file.path).readableStream()
}

export async function uploadFiles(
  files: Omit<FileMetadata, 'md5'>[],
  uploadedDir?: Directory
): Promise<FileMetadata[]> {
  const filePromises = files.map(async file => {
    try {
      const storageDir = uploadedDir
        ? uploadedDir
        : file.type === FileTypes.IMAGE
          ? DEFAULT_IMAGES_STORAGE
          : DEFAULT_DOCUMENTS_STORAGE
      await ensureDirExists(storageDir)
      const sourceUri = file.path
      const sourceFile = new File(sourceUri)
      // ios upload image will be .JPG
      const normalizedExt = normalizeExtension(file.ext)
      const destinationUri = `${storageDir.uri}${file.id}${normalizedExt}`
      const destinationFile = new File(destinationUri)

      if (destinationFile.exists) {
        destinationFile.delete()
      }
      sourceFile.move(destinationFile)

      if (!sourceFile.exists) {
        throw new Error('Failed to copy file or get info.')
      }

      const finalFile: FileMetadata = {
        ...file,
        path: destinationUri,
        size: sourceFile.size,
        ext: normalizedExt
      }
      fileDatabase.upsertFiles([finalFile])
      return finalFile
    } catch (error) {
      logger.error('Error uploading file:', error)
      throw new Error(`Failed to upload file: ${file.name}`)
    }
  })
  return await Promise.all(filePromises)
}

async function deleteFile(id: string, force: boolean = false): Promise<void> {
  try {
    const file = await fileDatabase.getFileById(id)
    if (!file) return
    const sourceFile = new File(file.path)

    if (!force && file.count > 1) {
      fileDatabase.upsertFiles([{ ...file, count: file.count - 1 }])
      return
    }

    fileDatabase.deleteFileById(id)

    sourceFile.delete()
  } catch (error) {
    logger.error('Error deleting file:', error)
    throw new Error(`Failed to delete file: ${id}`)
  }
}

export async function deleteFiles(files: FileMetadata[]): Promise<void> {
  await Promise.all(files.map(file => deleteFile(file.id)))
}

export async function resetCacheDirectory() {
  try {
    if (DEFAULT_STORAGE.exists) {
      DEFAULT_STORAGE.delete()
    }

    // Delete ImagePicker directory
    const imagePickerDirectory = new Directory(Paths.cache, 'ImagePicker')

    if (imagePickerDirectory.exists) {
      imagePickerDirectory.delete()
    }

    // Delete DocumentPicker directory
    const documentPickerDirectory = new Directory(Paths.cache, 'DocumentPicker')

    if (documentPickerDirectory.exists) {
      documentPickerDirectory.delete()
    }

    // Recreate Files directory
    DEFAULT_STORAGE.create({ intermediates: true })
  } catch (error) {
    logger.error('resetCacheDirectory', error)
  }
}

export async function getDirectorySizeAsync(directoryUri: string): Promise<number> {
  try {
    const directory = new Directory(directoryUri)

    if (!directory.exists) {
      return 0
    }

    let totalSize = 0
    const contents = directory.list()

    for (const item of contents) {
      if (item instanceof Directory) {
        totalSize += await getDirectorySizeAsync(item.uri)
      } else {
        totalSize += item.size || 0
      }
    }

    return totalSize
  } catch (error) {
    console.error('Cannot get directory size:', error)
    return 0
  }
}

/**
 * Get Cache Directory Size
 * @returns Cache Directory Size
 */
export async function getCacheDirectorySize() {
  // imagePicker and documentPicker will copy files to File, so size will double compututaion
  // this is not equal to ios system cache storage

  // const imagePickerDirectory = new Directory(Paths.cache, 'ImagePicker')
  // const documentPickerDirectory = new Directory(Paths.cache, 'DocumentPicker')

  const filesSize = await getDirectorySizeAsync(DEFAULT_STORAGE.uri)
  // const imageSize = await getDirectorySizeAsync(imagePickerDirectory.uri)
  // const documentSize = await getDirectorySizeAsync(documentPickerDirectory.uri)

  // return filesSize + imageSize + documentSize
  return filesSize
}

export async function shareFile(uri: string): Promise<ShareFileResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) {
      logger.warn('Sharing is not available on this device')
      return {
        success: false,
        message: 'Sharing is not available on this device.'
      }
    }

    const fileInfo = new File(uri).info()

    if (!fileInfo.exists) {
      logger.error('File not found:', uri)
      return {
        success: false,
        message: 'File not found.'
      }
    }

    await Sharing.shareAsync(uri)

    logger.info('File shared successfully')
    return {
      success: true,
      message: 'File shared successfully.'
    }
  } catch (error) {
    logger.error('Error sharing file:', error)
    return {
      success: false,
      message: 'Failed to share file. Please try again.'
    }
  }
}

/**
 * Save a file to a user-selected folder on Android using Directory.pickDirectoryAsync().
 * Falls back to sharing on iOS.
 *
 * @param sourceUri - The file:// URI of the source file to save
 * @param fileName - The desired file name (with extension)
 * @param mimeType - The MIME type of the file (e.g., 'application/zip', 'text/plain')
 * @returns ShareFileResult indicating success/failure
 */
export async function saveFileToFolder(
  sourceUri: string,
  fileName: string,
  mimeType: string
): Promise<ShareFileResult> {
  // iOS: Use sharing
  if (Platform.OS !== 'android') {
    return shareFile(sourceUri)
  }

  try {
    // Check source file exists
    const sourceFile = new File(sourceUri)
    if (!sourceFile.exists) {
      logger.error('Source file not found:', sourceUri)
      return { success: false, message: 'File not found.' }
    }

    // Open directory picker (returns Directory with content:// URI on Android)
    const directory = await Directory.pickDirectoryAsync()
    if (!directory) {
      return { success: false, message: 'cancelled' }
    }

    // Create file in selected directory (without extension, mimeType determines it)
    const fileNameWithoutExt =
      fileName.lastIndexOf('.') > 0 ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName

    const newFile = directory.createFile(fileNameWithoutExt, mimeType)

    // Copy content: use bytes() for binary, text() for text
    const isBinary = mimeType !== 'text/plain'
    if (isBinary) {
      newFile.write(await sourceFile.bytes())
    } else {
      newFile.write(await sourceFile.text())
    }

    logger.info('File saved successfully to:', newFile.uri)
    return {
      success: true,
      message: 'File saved successfully.',
      savedUri: newFile.uri
    }
  } catch (error) {
    logger.error('Error saving file to folder:', error)
    return {
      success: false,
      message: 'Failed to save file. Please try again.'
    }
  }
}

export async function downloadFileAsync(url: string, destination: File) {
  return File.downloadFileAsync(url, destination)
}

export default {
  readFile,
  readBase64File,
  readStreamFile,
  saveTextAsFile,
  getFile: getFileById,
  getAllFiles,
  uploadFiles,
  deleteFiles,
  resetCacheDirectory,
  getDirectorySizeAsync,
  getCacheDirectorySize,
  shareFile,
  saveFileToFolder,
  downloadFileAsync
}

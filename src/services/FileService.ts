import { fileDatabase } from '@database'
import { Directory, File, Paths } from 'expo-file-system'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'

import type { FileAPI, ShareFileResult, SpanContext } from '@/api/file'
import { DEFAULT_DOCUMENTS_STORAGE, DEFAULT_IMAGES_STORAGE, DEFAULT_STORAGE } from '@/constants/storage'
import { loggerService } from '@/services/LoggerService'
import type { FileMetadata } from '@/types/file'
import { FileTypes } from '@/types/file'
import { uuid } from '@/utils'

const logger = loggerService.withContext('File Service')
const { getAllFiles, getFileById } = fileDatabase

// 辅助函数，确保目录存在
async function ensureDirExists(dir: Directory) {
  const dirInfo = dir.info()

  if (!dirInfo.exists) {
    dir.create({ intermediates: true })
  }
}

/**
 * Expo File Service - implements FileAPI interface for Expo platform
 * Singleton pattern implementation
 */
class ExpoFileService implements FileAPI {
  private static instance: ExpoFileService
  private cacheDirPath: string = Paths.join(Paths.cache, 'Files')

  private constructor() {
    // Private constructor prevents external instantiation
  }

  public static getInstance(): ExpoFileService {
    if (!ExpoFileService.instance) {
      ExpoFileService.instance = new ExpoFileService()
    }
    return ExpoFileService.instance
  }
  // ==================== Selection Methods ====================

  async select(): Promise<FileMetadata[] | null> {
    throw new Error('Not implemented for Expo platform - use document/image pickers instead')
  }

  async selectFolder(): Promise<string | null> {
    throw new Error('Not implemented for Expo platform')
  }

  // ==================== Upload/Delete Methods ====================

  async upload(file: FileMetadata): Promise<FileMetadata> {
    const files = await this.uploadFiles([file])
    return files[0]
  }

  async uploadFiles(files: Omit<FileMetadata, 'md5'>[], uploadedDir?: Directory): Promise<FileMetadata[]> {
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
        const destinationUri = `${storageDir.uri}${file.id}.${file.ext.toLowerCase()}`
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
          size: sourceFile.size
        }
        console.log('finalFile', finalFile)
        fileDatabase.upsertFiles([finalFile])
        return finalFile
      } catch (error) {
        logger.error('Error uploading file:', error)
        throw new Error(`Failed to upload file: ${file.name}`)
      }
    })
    return await Promise.all(filePromises)
  }

  async delete(fileId: string): Promise<void> {
    await this.deleteFile(fileId, false)
  }

  async deleteFiles(files: FileMetadata[]): Promise<void> {
    await Promise.all(files.map(file => this.deleteFile(file.id)))
  }

  private async deleteFile(id: string, force: boolean = false): Promise<void> {
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

  async deleteDir(dirPath: string): Promise<void> {
    const dir = new Directory(dirPath)
    if (dir.exists) {
      dir.delete()
    }
  }

  async deleteExternalFile(filePath: string): Promise<void> {
    const file = new File(filePath)
    if (file.exists) {
      file.delete()
    }
  }

  async deleteExternalDir(dirPath: string): Promise<void> {
    await this.deleteDir(dirPath)
  }

  // ==================== Move/Rename Methods ====================

  async move(path: string, newPath: string): Promise<void> {
    const sourceFile = new File(path)
    const destFile = new File(newPath)
    sourceFile.move(destFile)
  }

  async moveDir(dirPath: string, newDirPath: string): Promise<void> {
    const sourceDir = new Directory(dirPath)
    const destDir = new Directory(newDirPath)
    sourceDir.move(destDir)
  }

  async rename(path: string, newName: string): Promise<void> {
    const file = new File(path)
    const dir = file.uri.substring(0, file.uri.lastIndexOf('/') + 1)
    const newPath = dir + newName
    await this.move(path, newPath)
  }

  async renameDir(dirPath: string, newName: string): Promise<void> {
    const dir = new Directory(dirPath)
    const parentUri = dir.uri.substring(0, dir.uri.lastIndexOf('/', dir.uri.length - 2) + 1)
    const newPath = parentUri + newName
    await this.moveDir(dirPath, newPath)
  }

  // ==================== Read Methods ====================

  async read(fileId: string): Promise<string> {
    const file = await getFileById(fileId)
    if (!file) {
      throw new Error(`File not found: ${fileId}`)
    }
    return this.readFile(file)
  }

  readFile(file: FileMetadata): string {
    return new File(file.path).textSync()
  }

  async readExternal(filePath: string): Promise<string> {
    const file = new File(filePath)
    return file.text()
  }

  async readBase64(file: FileMetadata): Promise<string> {
    return await this.readBase64File(file)
  }

  private async readBase64File(file: FileMetadata): Promise<string> {
    return await new File(file.path).base64()
  }

  readStream(file: FileMetadata): ReadableStream {
    return this.readStreamFile(file)
  }

  readStreamFile(file: FileMetadata): ReadableStream {
    return new File(file.path).readableStream()
  }

  // ==================== Write Methods ====================

  async write(filePath: string, data: Uint8Array | string): Promise<void> {
    const file = new File(filePath)
    if (typeof data === 'string') {
      file.write(data)
    } else {
      // For Uint8Array, write as base64
      const base64 = this.uint8ArrayToBase64(data)
      await FileSystem.writeAsStringAsync(filePath, base64, {
        encoding: FileSystem.EncodingType.Base64
      })
    }
  }

  async writeWithId(_id: string, _content: string): Promise<void> {
    throw new Error('Not implemented for Expo platform')
  }

  async writeBase64(data: string): Promise<FileMetadata> {
    return this.writeBase64File(data)
  }

  async writeBase64File(data: string): Promise<FileMetadata> {
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

  // ==================== File Operations ====================

  async clear(_spanContext?: SpanContext): Promise<void> {
    await this.resetCacheDirectory()
  }

  async resetCacheDirectory(): Promise<void> {
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

  async get(filePath: string): Promise<FileMetadata | null> {
    const file = new File(filePath)
    if (!file.exists) {
      return null
    }

    const info = file.info()
    const ext = filePath.substring(filePath.lastIndexOf('.'))

    return {
      id: filePath,
      name: filePath.substring(filePath.lastIndexOf('/') + 1),
      origin_name: filePath.substring(filePath.lastIndexOf('/') + 1),
      path: filePath,
      size: info.size || 0,
      ext,
      type: this.getFileTypeFromExt(ext),
      created_at: Date.now(),
      count: 1
    }
  }

  async createTempFile(_fileName: string): Promise<string> {
    throw new Error('Not implemented for Expo platform')
  }

  async mkdir(dirPath: string): Promise<void> {
    const dir = new Directory(dirPath)
    if (!dir.exists) {
      dir.create({ intermediates: true })
    }
  }

  async open(): Promise<void> {
    throw new Error('Not implemented for Expo platform')
  }

  async openPath(_path: string): Promise<void> {
    throw new Error('Not implemented for Expo platform')
  }

  async save(path: string, content: string | Uint8Array): Promise<void> {
    await this.write(path, content)
  }

  // ==================== Image Methods ====================

  async saveImage(_name: string, _data: string): Promise<FileMetadata> {
    throw new Error('Use saveBase64Image instead')
  }

  async binaryImage(file: FileMetadata): Promise<Uint8Array<ArrayBufferLike>> {
    const base64Data = await this.readBase64File(file)
    const binaryString = atob(base64Data)
    const bytes = new Uint8Array(binaryString.length)
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    
    return bytes
  }

  async base64Image(fileId: string): Promise<{ mime: string; data: string }> {
    const image = new File(Paths.join(this.cacheDirPath, fileId))
    image.type = image.type.replace('jpg', 'jpeg')
    return {
      data: await image.base64(),
      mime: image.type
    }
  }

  async saveBase64Image(data: string): Promise<FileMetadata> {
    return this.writeBase64File(data)
  }

  async savePastedImage(_imageData: Uint8Array, _extension?: string): Promise<FileMetadata> {
    throw new Error('Not implemented for Expo platform')
  }

  // ==================== Download/Copy Methods ====================

  async download(url: string, destination: File): Promise<FileMetadata> {
    return await this.downloadFileAsync(url, destination)
  }

  async downloadFileAsync(url: string, destination: File): Promise<FileMetadata> {
    const downloadedFile = await File.downloadFileAsync(url, destination)
    const ext = destination.uri.substring(destination.uri.lastIndexOf('.'))
    const fileName = destination.uri.substring(destination.uri.lastIndexOf('/') + 1)

    return {
      id: fileName,
      name: fileName,
      origin_name: fileName,
      path: downloadedFile.uri,
      size: downloadedFile.size,
      ext,
      type: this.getFileTypeFromExt(ext),
      created_at: Date.now(),
      count: 1
    }
  }

  async copy(fileId: string, destPath: string): Promise<void> {
    const sourceFile = new File(fileId)
    const destFile = new File(destPath)
    sourceFile.copy(destFile)
  }

  async base64File(file: FileMetadata): Promise<{ data: string; mime: string }> {
    const _file = new File(file.path)
    return {
      data: await _file.base64(),
      mime: _file.type
    }
  }

  // ==================== PDF Methods ====================

  async pdfInfo(_fileId: string): Promise<any> {
    throw new Error('Not implemented for Expo platform')
  }

  // ==================== File System Methods ====================

  getPathForFile(_file: globalThis.File): string {
    // For web File objects, this might not work as expected
    // In Expo, we typically work with URIs
    throw new Error('Not implemented for Expo platform - use file URIs instead')
  }

  async openFileWithRelativePath(_file: FileMetadata): Promise<void> {
    throw new Error('Not implemented for Expo platform')
  }

  async isTextFile(filePath: string): Promise<boolean> {
    const ext = filePath.substring(filePath.lastIndexOf('.'))
    return this.getFileTypeFromExt(ext) === FileTypes.TEXT
  }

  async getDirectoryStructure(_dirPath: string): Promise<any> {
    throw new Error('Not implemented for Expo platform')
  }

  async checkFileName(dirPath: string, fileName: string, isFile: boolean): Promise<boolean> {
    const path = isFile ? `${dirPath}/${fileName}` : dirPath
    const target = isFile ? new File(path) : new Directory(path)
    return !target.exists
  }

  async validateNotesDirectory(dirPath: string): Promise<boolean> {
    const dir = new Directory(dirPath)
    return dir.exists
  }

  // ==================== File Watcher Methods ====================

  async startFileWatcher(_dirPath: string, _config?: any): Promise<void> {
    throw new Error('Not implemented for Expo platform')
  }

  async stopFileWatcher(): Promise<void> {
    throw new Error('Not implemented for Expo platform')
  }

  onFileChange(_callback: (data: any) => void): () => void {
    throw new Error('Not implemented for Expo platform')
  }

  async showInFolder(_path: string): Promise<void> {
    throw new Error('Not implemented for Expo platform')
  }

  // ==================== Share Methods ====================

  async shareFile(uri: string): Promise<ShareFileResult> {
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

  // ==================== Directory Size Methods ====================

  async getDirectorySize(directoryUri: string): Promise<number> {
    return this.getDirectorySizeAsync(directoryUri)
  }

  async getDirectorySizeAsync(directoryUri: string): Promise<number> {
    try {
      const directory = new Directory(directoryUri)

      if (!directory.exists) {
        return 0
      }

      let totalSize = 0
      const contents = directory.list()

      for (const item of contents) {
        if (item instanceof Directory) {
          totalSize += await this.getDirectorySizeAsync(item.uri)
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
  async getCacheDirectorySize(): Promise<number> {
    // imagePicker and documentPicker will copy files to File, so size will double compututaion
    // this is not equal to ios system cache storage

    // const imagePickerDirectory = new Directory(Paths.cache, 'ImagePicker')
    // const documentPickerDirectory = new Directory(Paths.cache, 'DocumentPicker')

    const filesSize = await this.getDirectorySizeAsync(DEFAULT_STORAGE.uri)
    // const imageSize = await this.getDirectorySizeAsync(imagePickerDirectory.uri)
    // const documentSize = await this.getDirectorySizeAsync(documentPickerDirectory.uri)

    // return filesSize + imageSize + documentSize
    return filesSize
  }

  // ==================== Helper Methods ====================

  private getFileTypeFromExt(ext: string): FileTypes {
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.heic']
    const videoExts = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv']
    const audioExts = ['.mp3', '.wav', '.ogg', '.flac', '.aac']
    const documentExts = ['.pdf', '.doc', '.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods']

    const lowerExt = ext.toLowerCase()
    if (imageExts.includes(lowerExt)) return FileTypes.IMAGE
    if (videoExts.includes(lowerExt)) return FileTypes.VIDEO
    if (audioExts.includes(lowerExt)) return FileTypes.AUDIO
    if (documentExts.includes(lowerExt)) return FileTypes.DOCUMENT
    return FileTypes.OTHER
  }

  private uint8ArrayToBase64(data: Uint8Array): string {
    let binary = ''
    const len = data.byteLength
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(data[i])
    }
    return btoa(binary)
  }
}

// Get singleton instance
const fileService = ExpoFileService.getInstance()

// Export singleton instance
export { fileService }

// Export class for testing/extending
export { ExpoFileService }

// Export backward compatible methods
export function readFile(file: FileMetadata): string {
  return fileService.readFile(file)
}

export async function readBase64File(file: FileMetadata): Promise<string> {
  return await fileService.readBase64(file)
}

export function readStreamFile(file: FileMetadata): ReadableStream {
  return fileService.readStreamFile(file)
}

export async function writeBase64File(data: string): Promise<FileMetadata> {
  return fileService.writeBase64File(data)
}

export async function uploadFiles(
  files: Omit<FileMetadata, 'md5'>[],
  uploadedDir?: Directory
): Promise<FileMetadata[]> {
  return fileService.uploadFiles(files, uploadedDir)
}

export async function deleteFiles(files: FileMetadata[]): Promise<void> {
  return fileService.deleteFiles(files)
}

export async function resetCacheDirectory(): Promise<void> {
  return fileService.resetCacheDirectory()
}

export async function getDirectorySizeAsync(directoryUri: string): Promise<number> {
  return fileService.getDirectorySizeAsync(directoryUri)
}

export async function getCacheDirectorySize(): Promise<number> {
  return fileService.getCacheDirectorySize()
}

export async function shareFile(uri: string): Promise<ShareFileResult> {
  return fileService.shareFile(uri)
}

export async function downloadFileAsync(url: string, destination: File): Promise<FileMetadata> {
  return fileService.downloadFileAsync(url, destination)
}

// Default export for backward compatibility
export default {
  readFile,
  readBase64File,
  readStreamFile,
  writeBase64File,
  getFile: getFileById,
  getAllFiles,
  uploadFiles,
  deleteFiles,
  resetCacheDirectory,
  getDirectorySizeAsync,
  getCacheDirectorySize,
  shareFile,
  downloadFileAsync
}

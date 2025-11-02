import type { File } from 'expo-file-system'

import type { FileMetadata } from '@/types/file'

/**
 * File API interface - provides a unified interface for file operations
 * across different platforms (Expo/Electron)
 */
export interface FileAPI {
  /**
   * Select files from the file system
   */
  select(options?: FileSelectOptions): Promise<FileMetadata[] | null>

  /**
   * Upload/copy file to storage
   */
  upload(file: FileMetadata): Promise<FileMetadata>

  /**
   * Delete a file by ID
   */
  delete(fileId: string): Promise<void>

  /**
   * Delete a directory
   */
  deleteDir(dirPath: string): Promise<void>

  /**
   * Delete an external file
   */
  deleteExternalFile(filePath: string): Promise<void>

  /**
   * Delete an external directory
   */
  deleteExternalDir(dirPath: string): Promise<void>

  /**
   * Move a file
   */
  move(path: string, newPath: string): Promise<void>

  /**
   * Move a directory
   */
  moveDir(dirPath: string, newDirPath: string): Promise<void>

  /**
   * Rename a file
   */
  rename(path: string, newName: string): Promise<void>

  /**
   * Rename a directory
   */
  renameDir(dirPath: string, newName: string): Promise<void>

  /**
   * Read a file by ID
   */
  read(fileId: string, detectEncoding?: boolean): Promise<string>

  /**
   * Read an external file
   */
  readExternal(filePath: string, detectEncoding?: boolean): Promise<string>

  /**
   * Read file as base64
   */
  readBase64(file: FileMetadata): Promise<string>

  /**
   * Read file as stream
   */
  readStream(file: FileMetadata): ReadableStream

  /**
   * Clear all files
   */
  clear(spanContext?: SpanContext): Promise<void>

  /**
   * Get file metadata by path
   */
  get(filePath: string): Promise<FileMetadata | null>

  /**
   * Create a temporary file
   */
  createTempFile(fileName: string): Promise<string>

  /**
   * Create a directory
   */
  mkdir(dirPath: string): Promise<void>

  /**
   * Write data to a file
   */
  write(filePath: string, data: Uint8Array | string): Promise<void>

  /**
   * Write content to a file by ID
   */
  writeWithId(id: string, content: string): Promise<void>

  /**
   * Write base64 data to a file
   */
  writeBase64(data: string): Promise<FileMetadata>

  /**
   * Open file dialog
   */
  open(options?: FileSelectOptions): Promise<void>

  /**
   * Open file at path with system default app
   */
  openPath(path: string): Promise<void>

  /**
   * Save file to disk
   */
  save(path: string, content: string | Uint8Array, options?: any): Promise<void>

  /**
   * Select a folder
   */
  selectFolder(options?: FileSelectOptions): Promise<string | null>

  /**
   * Save image
   */
  saveImage(name: string, data: string): Promise<FileMetadata>

  /**
   * Get binary image data
   */
  binaryImage(file: FileMetadata): Promise<Uint8Array<ArrayBufferLike>>

  /**
   * Get base64 image data
   */
  base64Image(fileId: string): Promise<{ mime: string; data: string }>

  /**
   * Save base64 image
   */
  saveBase64Image(data: string): Promise<FileMetadata>

  /**
   * Save pasted image
   */
  savePastedImage(imageData: Uint8Array, extension?: string): Promise<FileMetadata>

  /**
   * Download file from URL
   */
  download(url: string, destination: File): Promise<FileMetadata>

  /**
   * Copy file to destination
   */
  copy(fileId: string, destPath: string): Promise<void>

  /**
   * Get base64 file data
   */
  base64File(file: FileMetadata): Promise<{ mime: string; data: string }>

  /**
   * Get PDF info
   */
  pdfInfo(fileId: string): Promise<any>

  /**
   * Get path for file
   */
  getPathForFile(file: globalThis.File): string

  /**
   * Open file with relative path
   */
  openFileWithRelativePath(file: FileMetadata): Promise<void>

  /**
   * Check if file is text file
   */
  isTextFile(filePath: string): Promise<boolean>

  /**
   * Get directory structure
   */
  getDirectoryStructure(dirPath: string): Promise<any>

  /**
   * Check file name validity
   */
  checkFileName(dirPath: string, fileName: string, isFile: boolean): Promise<boolean>

  /**
   * Validate notes directory
   */
  validateNotesDirectory(dirPath: string): Promise<boolean>

  /**
   * Start file watcher
   */
  startFileWatcher(dirPath: string, config?: any): Promise<void>

  /**
   * Stop file watcher
   */
  stopFileWatcher(): Promise<void>

  /**
   * Listen to file changes
   */
  onFileChange(callback: (data: FileChangeEvent) => void): () => void

  /**
   * Show file in folder
   */
  showInFolder(path: string): Promise<void>

  /**
   * Share file (mobile platforms)
   */
  shareFile(uri: string): Promise<ShareFileResult>

  /**
   * Get directory size
   */
  getDirectorySize(directoryUri: string): Promise<number>
}

/**
 * File select options
 */
export interface FileSelectOptions {
  multiple?: boolean
  type?: string[]
  title?: string
}

/**
 * File change event
 */
export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

/**
 * Share file result
 */
export interface ShareFileResult {
  success: boolean
  message: string
}

/**
 * Span context for tracing
 */
export interface SpanContext {
  traceId: string
  spanId: string
}

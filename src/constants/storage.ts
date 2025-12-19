import { Directory, Paths } from 'expo-file-system'

export const DEFAULT_STORAGE = new Directory(Paths.cache, 'Files')
export const DEFAULT_IMAGES_STORAGE = new Directory(Paths.cache, 'Files', 'Images')
export const DEFAULT_DOCUMENTS_STORAGE = new Directory(Paths.cache, 'Files', 'Documents')
export const DEFAULT_ICONS_STORAGE = new Directory(Paths.cache, 'Files', 'Icons')
export const DEFAULT_BACKUP_STORAGE = new Directory(Paths.cache, 'Files', 'Backups')

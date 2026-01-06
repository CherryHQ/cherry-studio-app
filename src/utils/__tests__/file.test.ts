import { FileTypes } from '@/types/file'

import { getFileExtension, getFileType, normalizeExtension } from '../file'

describe('file utils', () => {
  describe('getFileExtension', () => {
    it('should return extension with dot for normal files', () => {
      expect(getFileExtension('document.pdf')).toBe('.pdf')
      expect(getFileExtension('image.PNG')).toBe('.png')
      expect(getFileExtension('script.ts')).toBe('.ts')
    })

    it('should handle files with multiple dots', () => {
      expect(getFileExtension('archive.tar.gz')).toBe('.gz')
      expect(getFileExtension('file.test.ts')).toBe('.ts')
      expect(getFileExtension('my.file.name.txt')).toBe('.txt')
    })

    it('should return empty string for hidden files (dot at start)', () => {
      expect(getFileExtension('.gitignore')).toBe('')
      expect(getFileExtension('.env')).toBe('')
      expect(getFileExtension('.bashrc')).toBe('')
    })

    it('should return empty string for files ending with dot', () => {
      expect(getFileExtension('file.')).toBe('')
      expect(getFileExtension('document.')).toBe('')
    })

    it('should return empty string for files without extension', () => {
      expect(getFileExtension('README')).toBe('')
      expect(getFileExtension('Makefile')).toBe('')
      expect(getFileExtension('file')).toBe('')
    })

    it('should return empty string for empty input', () => {
      expect(getFileExtension('')).toBe('')
    })

    it('should convert extension to lowercase', () => {
      expect(getFileExtension('photo.JPG')).toBe('.jpg')
      expect(getFileExtension('document.PDF')).toBe('.pdf')
      expect(getFileExtension('image.PNG')).toBe('.png')
    })
  })

  describe('normalizeExtension', () => {
    it('should add dot to extension without dot', () => {
      expect(normalizeExtension('pdf')).toBe('.pdf')
      expect(normalizeExtension('jpg')).toBe('.jpg')
      expect(normalizeExtension('txt')).toBe('.txt')
    })

    it('should keep dot for extension with dot', () => {
      expect(normalizeExtension('.pdf')).toBe('.pdf')
      expect(normalizeExtension('.jpg')).toBe('.jpg')
      expect(normalizeExtension('.txt')).toBe('.txt')
    })

    it('should convert to lowercase', () => {
      expect(normalizeExtension('PDF')).toBe('.pdf')
      expect(normalizeExtension('.PDF')).toBe('.pdf')
      expect(normalizeExtension('JPG')).toBe('.jpg')
      expect(normalizeExtension('.JPG')).toBe('.jpg')
    })

    it('should return empty string for empty input', () => {
      expect(normalizeExtension('')).toBe('')
    })

    it('should be idempotent (calling multiple times gives same result)', () => {
      const ext = '.pdf'
      expect(normalizeExtension(normalizeExtension(ext))).toBe('.pdf')
      expect(normalizeExtension(normalizeExtension(normalizeExtension('PDF')))).toBe('.pdf')
    })
  })

  describe('getFileType', () => {
    it('should return correct type for image extensions', () => {
      expect(getFileType('.jpg')).toBe(FileTypes.IMAGE)
      expect(getFileType('.png')).toBe(FileTypes.IMAGE)
      expect(getFileType('.gif')).toBe(FileTypes.IMAGE)
      expect(getFileType('jpg')).toBe(FileTypes.IMAGE)
    })

    it('should return correct type for document extensions', () => {
      expect(getFileType('.pdf')).toBe(FileTypes.DOCUMENT)
      expect(getFileType('.doc')).toBe(FileTypes.DOCUMENT)
      expect(getFileType('.docx')).toBe(FileTypes.DOCUMENT)
      expect(getFileType('pdf')).toBe(FileTypes.DOCUMENT)
    })

    it('should return correct type for video extensions', () => {
      expect(getFileType('.mp4')).toBe(FileTypes.VIDEO)
      expect(getFileType('.mov')).toBe(FileTypes.VIDEO)
      expect(getFileType('mp4')).toBe(FileTypes.VIDEO)
    })

    it('should return correct type for audio extensions', () => {
      expect(getFileType('.mp3')).toBe(FileTypes.AUDIO)
      expect(getFileType('.wav')).toBe(FileTypes.AUDIO)
      expect(getFileType('mp3')).toBe(FileTypes.AUDIO)
    })

    it('should return OTHER for unknown extensions', () => {
      expect(getFileType('.xyz')).toBe(FileTypes.OTHER)
      expect(getFileType('.unknown')).toBe(FileTypes.OTHER)
      expect(getFileType('xyz')).toBe(FileTypes.OTHER)
    })

    it('should handle case insensitivity', () => {
      expect(getFileType('.PDF')).toBe(FileTypes.DOCUMENT)
      expect(getFileType('.JPG')).toBe(FileTypes.IMAGE)
      expect(getFileType('PNG')).toBe(FileTypes.IMAGE)
    })
  })
})

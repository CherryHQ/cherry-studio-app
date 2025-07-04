import React from 'react'
import { ScrollView } from 'tamagui'

import { FileType } from '@/types/file'

import PreviewItem from './PreviewItem'

interface FilePreviewProps {
  files: FileType[]
  setFiles: (files: FileType[]) => void
}

const FilePreview: React.FC<FilePreviewProps> = ({ files, setFiles }) => {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={true} style={{ flexDirection: 'row' }}>
      {files.map((file, index) => (
        <PreviewItem key={index} file={file} files={files} setFiles={setFiles} />
      ))}
    </ScrollView>
  )
}

export default FilePreview

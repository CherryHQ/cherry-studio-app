import { Directory, File, Paths } from 'expo-file-system/next'

import { BackupData, BackupReduxData } from '@/types/databackup'
import { FileType } from '@/types/file'
import { ValueJSONed } from '@/types/utils'

const fileStorageDir = new Directory(Paths.cache, 'Files')

async function restoreTopics(topics: BackupData['indexedDB']['topics']) {
  // restore topics
}

export async function restore(backupFile: Omit<FileType, 'md5'>) {
  console.log('start to restore data...')

  if (!fileStorageDir.exists) {
    fileStorageDir.create({ intermediates: true, overwrite: true })
  }

  try {
    // read data.json
    const data = JSON.parse(new File(backupFile.path).text()) as BackupData

    const reduxData = JSON.parse(data.localStorage['persist:cherry-studio']) as ValueJSONed<BackupReduxData>

    console.log('reduxData: ', reduxData.agents)

    for (const key of Object.keys(reduxData) as (keyof BackupReduxData)[]) {
      const value = reduxData[key]
      console.log('key: ', key)
      console.log('value: ', JSON.parse(value))
    }

    // restore data
  } catch (error) {
    console.log('restore error: ', error)
  }
}

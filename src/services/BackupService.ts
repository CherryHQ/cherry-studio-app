import { Directory, File, Paths } from 'expo-file-system/next'
import { unzip } from 'react-native-zip-archive'

import { BackupData, BackupReduxData } from '@/types/databackup'
import { FileType } from '@/types/file'
import { ValueJSONed } from '@/types/utils'

import { upsertBlocks } from '../../db/queries/messageBlocks.queries'
import { updateTopics } from './TopicService'

const fileStorageDir = new Directory(Paths.cache, 'Files')

async function restoreDBData(data: BackupData['indexedDB']) {
  if (1) return
  updateTopics(data.topics)
  upsertBlocks(data.message_blocks)
}

async function restoreReduxData(data: BackupReduxData) {
  console.log(data)
}

export async function restore(backupFile: Omit<FileType, 'md5'>) {
  console.log('start to restore data...')

  if (!fileStorageDir.exists) {
    fileStorageDir.create({ intermediates: true, overwrite: true })
  }

  try {
    // unzip
    const backupDir = new Directory(fileStorageDir, backupFile.name)
    await unzip(backupFile.path, backupDir.uri)
    console.log('backupDir: ', backupDir)

    // read data.json
    const data = JSON.parse(new File(backupDir.uri, 'data.json').text()) as BackupData

    const reduxDataJSON = JSON.parse(data.localStorage['persist:cherry-studio']) as ValueJSONed<BackupReduxData>
    const reduxData: BackupReduxData = {} as BackupReduxData

    for (const key of Object.keys(reduxDataJSON) as (keyof BackupReduxData)[]) {
      reduxData[key] = JSON.parse(reduxDataJSON[key])
    }

    // restore data
    await restoreDBData(data.indexedDB)
    await restoreReduxData(reduxData)
  } catch (error) {
    console.log('restore error: ', error)
  }
}

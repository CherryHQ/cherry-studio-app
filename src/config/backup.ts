export function getDataBackupProviders() {
  return [
    {
      id: 'webdav',
      name: 'WebDAV',
      webdavHost: '',
      webdavUser: '',
      webdavPass: '',
      webdavPath: ''
    },
    {
      id: 'nutstore',
      name: 'Nutstore',
      nutstoreToken: '',
      nutstorePath: '',
      nutstoreAutoSync: false,
      nutstoreSyncInterval: 60,
      nutstoreSyncState: ''
    },
    {
      id: 'notion',
      name: 'Notion',
      notionDatabaseID: '',
      notionApiKey: '',
      notionPageNameKey: '',
      notionExportReasoning: false
    },
    {
      id: 'yuque',
      name: '语雀',
      yuqueToken: '',
      yuqueUrl: '',
      yuqueRepoId: ''
    },
    {
      id: 'joplin',
      name: 'Joplin',
      joplinToken: '',
      joplinUrl: '',
      joplinExportReasoning: false
    },
    {
      id: 'obsidian',
      name: 'Obsidian'
      // Obsidian 配置待添加
    },
    {
      id: 'siyuan',
      name: '思源',
      siyuanApiUrl: '',
      siyuanToken: '',
      siyuanBoxId: '',
      siyuanRootPath: ''
    }
  ]
}

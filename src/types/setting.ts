import type { LanguageVarious, ThemeMode } from '.'

export interface TopicNamingSetting {
  autoNaming: boolean
  prompt: string
}

export interface TranslateModelSetting {
  specifyLanguage: boolean
  sourceLanguage: LanguageVarious | undefined
  targetLanguage: LanguageVarious | undefined
  prompt: string
}

// -----------------------
// 桌面端 settings store
// 待桌面端数据预处理后可移除
// -----------------------

export interface SettingsState {
  showAssistants: boolean
  showTopics: boolean
  assistantsTabSortType: 'tags' | 'list'
  sendMessageShortcut: 'Enter' | 'Shift+Enter' | 'Ctrl+Enter' | 'Command+Enter' | 'Alt+Enter'
  language: LanguageVarious
  targetLanguage: LanguageVarious
  proxyMode: 'system' | 'custom' | 'none'
  proxyUrl?: string
  userName: string
  userId: string
  showPrompt: boolean
  showTokens: boolean
  showMessageDivider: boolean
  messageFont: 'system' | 'serif'
  showInputEstimatedTokens: boolean
  launchOnBoot: boolean
  launchToTray: boolean
  trayOnClose: boolean
  tray: boolean
  theme: ThemeMode
  userTheme: {
    colorPrimary: string
  }
  windowStyle: 'transparent' | 'opaque'
  fontSize: number
  topicPosition: 'left' | 'right'
  showTopicTime: boolean
  pinTopicsToTop: boolean
  assistantIconType: 'model' | 'emoji' | 'none'
  pasteLongTextAsFile: boolean
  pasteLongTextThreshold: number
  clickAssistantToShowTopic: boolean
  autoCheckUpdate: boolean
  testPlan: boolean
  renderInputMessageAsMarkdown: boolean
  // 代码执行
  codeExecution: {
    enabled: boolean
    timeoutMinutes: number
  }
  codeEditor: {
    enabled: boolean
    themeLight: string
    themeDark: string
    highlightActiveLine: boolean
    foldGutter: boolean
    autocompletion: boolean
    keymap: boolean
  }
  codeShowLineNumbers: boolean
  codeCollapsible: boolean
  codeWrappable: boolean
  messageStyle: 'plain' | 'bubble'
  foldDisplayMode: 'expanded' | 'compact'
  gridColumns: number
  gridPopoverTrigger: 'hover' | 'click'
  messageNavigation: 'none' | 'buttons' | 'anchor'
  // 数据目录设置
  skipBackupFile: boolean
  // webdav 配置 host, user, pass, path
  webdavHost: string
  webdavUser: string
  webdavPass: string
  webdavPath: string
  webdavAutoSync: boolean
  webdavSyncInterval: number
  webdavMaxBackups: number
  webdavSkipBackupFile: boolean
  translateModelPrompt: string
  autoTranslateWithSpace: boolean
  showTranslateConfirm: boolean
  enableTopicNaming: boolean
  customCss: string
  topicNamingPrompt: string
  narrowMode: boolean
  // QuickAssistant
  enableQuickAssistant: boolean
  clickTrayToShowQuickAssistant: boolean
  readClipboardAtStartup: boolean
  notionDatabaseID: string | null
  notionApiKey: string | null
  notionPageNameKey: string | null
  markdownExportPath: string | null
  forceDollarMathInMarkdown: boolean
  useTopicNamingForMessageTitle: boolean
  showModelNameInMarkdown: boolean
  showModelProviderInMarkdown: boolean
  thoughtAutoCollapse: boolean
  notionExportReasoning: boolean
  yuqueToken: string | null
  yuqueUrl: string | null
  yuqueRepoId: string | null
  joplinToken: string | null
  joplinUrl: string | null
  joplinExportReasoning: boolean
  defaultObsidianVault: string | null
  defaultAgent: string | null
  // 思源笔记配置
  siyuanApiUrl: string | null
  siyuanToken: string | null
  siyuanBoxId: string | null
  siyuanRootPath: string | null
  // 订阅的助手地址
  agentssubscribeUrl: string | null
  // MinApps
  maxKeepAliveMinapps: number
  showOpenedMinappsInSidebar: boolean
  minappsOpenLinkExternal: boolean
  // 隐私设置
  enableDataCollection: boolean
  enableSpellCheck: boolean
  spellCheckLanguages: string[]
  enableQuickPanelTriggers: boolean
  enableBackspaceDeleteModel: boolean
  // 硬件加速设置
  disableHardwareAcceleration: boolean
  exportMenuOptions: {
    image: boolean
    markdown: boolean
    markdown_reason: boolean
    notion: boolean
    yuque: boolean
    joplin: boolean
    obsidian: boolean
    siyuan: boolean
    docx: boolean
    plain_text: boolean
  }
  // OpenAI
  // openAI: {
  //   summaryText: OpenAISummaryText
  //   serviceTier: OpenAIServiceTier
  // }
  // Notification
  notification: {
    assistant: boolean
    backup: boolean
    knowledge: boolean
  }
  // defaultPaintingProvider: PaintingProvider
}

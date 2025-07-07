import { Client } from '@notionhq/client'
import { markdownToBlocks } from '@tryfabric/martian'
import dayjs from 'dayjs'
import i18n from 'i18next'
import { appendBlocks } from 'notion-helper'
import { Alert } from 'react-native'

import { setExportState } from '@/store/runtime'
import { Topic } from '@/types/assistant'
import { Message } from '@/types/message'
import { convertMathFormula, markdownToPlainText } from '@/utils/markdown'
import { getCitationContent, getMainTextContent, getThinkingContent } from '@/utils/messageUtils/find'

/**
 * 从消息内容中提取标题，限制长度并处理换行和标点符号。用于导出功能。
 * @param {string} str 输入字符串
 * @param {number} [length=80] 标题最大长度，默认为 80
 * @returns {string} 提取的标题
 */
export function getTitleFromString(str: string, length: number = 80) {
  let title = str.trimStart().split('\n')[0]

  if (title.includes('。')) {
    title = title.split('。')[0]
  } else if (title.includes('，')) {
    title = title.split('，')[0]
  } else if (title.includes('.')) {
    title = title.split('.')[0]
  } else if (title.includes(',')) {
    title = title.split(',')[0]
  }

  if (title.length > length) {
    title = title.slice(0, length)
  }

  if (!title) {
    title = str.slice(0, length)
  }

  return title
}

const getRoleText = (role: string, modelName?: string, modelProvider?: string) => {
  const { showModelNameInMarkdown, showModelProviderInMarkdown } = store.getState().settings

  if (role === 'user') {
    return '🧑‍💻 User'
  } else if (role === 'system') {
    return '🤖 System'
  } else {
    let assistantText = '🤖 '

    if (showModelNameInMarkdown && modelName) {
      assistantText += `${modelName}`

      if (showModelProviderInMarkdown && modelProvider) {
        const providerDisplayName = i18n.t(`provider.${modelProvider}`, { defaultValue: modelProvider })
        assistantText += ` | ${providerDisplayName}`
        return assistantText
      }

      return assistantText
    } else if (showModelProviderInMarkdown && modelProvider) {
      const providerDisplayName = i18n.t(`provider.${modelProvider}`, { defaultValue: modelProvider })
      assistantText += `Assistant | ${providerDisplayName}`
      return assistantText
    }

    return assistantText + 'Assistant'
  }
}

const createBaseMarkdown = async (message: Message, includeReasoning: boolean = false) => {
  const { forceDollarMathInMarkdown } = store.getState().settings
  const roleText = getRoleText(message.role, message.model?.name, message.model?.provider)
  const titleSection = `### ${roleText}`
  let reasoningSection = ''

  if (includeReasoning) {
    let reasoningContent: string = await getThinkingContent(message)

    if (reasoningContent) {
      if (reasoningContent.startsWith('<think>\n')) {
        reasoningContent = reasoningContent.substring(8)
      } else if (reasoningContent.startsWith('<think>')) {
        reasoningContent = reasoningContent.substring(7)
      }

      reasoningContent = reasoningContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\n/g, '<br>')

      if (forceDollarMathInMarkdown) {
        reasoningContent = convertMathFormula(reasoningContent)
      }

      reasoningSection = `<div style="border: 2px solid #dddddd; border-radius: 10px;">
  <details style="padding: 5px;">
    <summary>${i18n.t('common.reasoning_content')}</summary>
    ${reasoningContent}
  </details>
</div>`
    }
  }

  const content = getMainTextContent(message)
  const citation = getCitationContent(message)
  const contentSection = forceDollarMathInMarkdown ? convertMathFormula(await content) : content

  return { titleSection, reasoningSection, contentSection, citation }
}

export const messageToMarkdown = (message: Message) => {
  const { titleSection, contentSection, citation } = createBaseMarkdown(message)
  return [titleSection, '', contentSection, citation].join('\n\n')
}

export const messageToMarkdownWithReasoning = (message: Message) => {
  const { titleSection, reasoningSection, contentSection, citation } = createBaseMarkdown(message, true)
  return [titleSection, '', reasoningSection + contentSection, citation].join('\n\n')
}

export const messagesToMarkdown = (messages: Message[], exportReasoning?: boolean) => {
  return messages
    .map(message => (exportReasoning ? messageToMarkdownWithReasoning(message) : messageToMarkdown(message)))
    .join('\n\n---\n\n')
}

const formatMessageAsPlainText = async (message: Message): Promise<string> => {
  const roleText = message.role === 'user' ? 'User:' : 'Assistant:'
  const content = getMainTextContent(message)
  const plainTextContent = markdownToPlainText(await content).trim()
  return `${roleText}\n${plainTextContent}`
}

export const messageToPlainText = async (message: Message): Promise<string> => {
  const content = getMainTextContent(message)
  return markdownToPlainText(await content).trim()
}

const messagesToPlainText = (messages: Message[]): string => {
  return messages.map(formatMessageAsPlainText).join('\n\n')
}

export const topicToMarkdown = async (topic: Topic, exportReasoning?: boolean) => {
  const topicName = `# ${topic.name}`
  const topicMessages = await db.topics.get(topic.id)

  if (topicMessages) {
    return topicName + '\n\n' + messagesToMarkdown(topicMessages.messages, exportReasoning)
  }

  return ''
}

export const topicToPlainText = async (topic: Topic): Promise<string> => {
  const topicName = markdownToPlainText(topic.name).trim()
  const topicMessages = await db.topics.get(topic.id)

  if (topicMessages && topicMessages.messages.length > 0) {
    return topicName + '\n\n' + messagesToPlainText(topicMessages.messages)
  }

  if (topicMessages && topicMessages.messages.length === 0) {
    return topicName
  }

  return ''
}

export const exportTopicAsMarkdown = async (topic: Topic, exportReasoning?: boolean) => {
  const { markdownExportPath } = store.getState().settings

  if (!markdownExportPath) {
    try {
      const fileName = removeSpecialCharactersForFileName(topic.name) + '.md'
      const markdown = await topicToMarkdown(topic, exportReasoning)
      const result = await window.api.file.save(fileName, markdown)

      if (result) {
        Alert.alert(i18n.t('message.success.markdown.export.specified'))
      }
    } catch (error: any) {
      Alert.alert(i18n.t('message.error.markdown.export.specified'))
    }
  } else {
    try {
      const timestamp = dayjs().format('YYYY-MM-DD-HH-mm-ss')
      const fileName = removeSpecialCharactersForFileName(topic.name) + ` ${timestamp}.md`
      const markdown = await topicToMarkdown(topic, exportReasoning)
      await window.api.file.write(markdownExportPath + '/' + fileName, markdown)
      Alert.alert(i18n.t('message.success.markdown.export.preconf'))
    } catch (error: any) {
      Alert.alert(i18n.t('message.error.markdown.export.preconf'))
    }
  }
}

export const exportMessageAsMarkdown = async (message: Message, exportReasoning?: boolean) => {
  const { markdownExportPath } = store.getState().settings

  if (!markdownExportPath) {
    try {
      const title = await getMessageTitle(message)
      const fileName = removeSpecialCharactersForFileName(title) + '.md'
      const markdown = exportReasoning ? messageToMarkdownWithReasoning(message) : messageToMarkdown(message)
      const result = await window.api.file.save(fileName, markdown)

      if (result) {
        Alert.alert(i18n.t('message.success.markdown.export.specified'))
      }
    } catch (error: any) {
      Alert.alert(i18n.t('message.error.markdown.export.specified'))
    }
  } else {
    try {
      const timestamp = dayjs().format('YYYY-MM-DD-HH-mm-ss')
      const title = await getMessageTitle(message)
      const fileName = removeSpecialCharactersForFileName(title) + ` ${timestamp}.md`
      const markdown = exportReasoning ? messageToMarkdownWithReasoning(message) : messageToMarkdown(message)
      await window.api.file.write(markdownExportPath + '/' + fileName, markdown)
      Alert.alert(i18n.t('message.success.markdown.export.preconf'))
    } catch (error: any) {
      Alert.alert(i18n.t('message.error.markdown.export.preconf'))
    }
  }
}

const convertMarkdownToNotionBlocks = async (markdown: string) => {
  return markdownToBlocks(markdown)
}

const convertThinkingToNotionBlocks = async (thinkingContent: string): Promise<any[]> => {
  if (!thinkingContent.trim()) {
    return []
  }

  return [
    {
      object: 'block',
      type: 'toggle',
      toggle: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: '🤔 ' + i18n.t('common.reasoning_content')
            },
            annotations: {
              bold: true
            }
          }
        ],
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: {
                    content: thinkingContent
                  }
                }
              ]
            }
          }
        ]
      }
    }
  ]
}

const executeNotionExport = async (title: string, allBlocks: any[]): Promise<any> => {
  const { isExporting } = store.getState().runtime.export

  if (isExporting) {
    Alert.alert(i18n.t('message.warn.notion.exporting'))
    return null
  }

  setExportState({ isExporting: true })

  title = title.slice(0, 29) + '...'

  const { notionDatabaseID, notionApiKey } = store.getState().settings

  if (!notionApiKey || !notionDatabaseID) {
    Alert.alert(i18n.t('message.error.notion.no_api_key'))
    setExportState({ isExporting: false })
    return null
  }

  try {
    const notion = new Client({ auth: notionApiKey })

    if (allBlocks.length === 0) {
      throw new Error('No content to export')
    }

    window.message.loading({
      content: i18n.t('message.loading.notion.preparing'),
      key: 'notion-preparing',
      duration: 0
    })
    let mainPageResponse: any = null
    let parentBlockId: string | null = null

    const response = await notion.pages.create({
      parent: { database_id: notionDatabaseID },
      properties: {
        [store.getState().settings.notionPageNameKey || 'Name']: {
          title: [{ text: { content: title } }]
        }
      }
    })
    mainPageResponse = response
    parentBlockId = response.id
    window.message.loading({
      content: i18n.t('message.loading.notion.exporting_progress'),
      key: 'notion-exporting',
      duration: 0
    })

    if (allBlocks.length > 0) {
      await appendBlocks({
        block_id: parentBlockId,
        children: allBlocks,
        client: notion
      })
    }

    Alert.alert(i18n.t('message.success.notion.export'))
    return mainPageResponse
  } catch (error: any) {
    Alert.alert(i18n.t('message.error.notion.export'))
    return null
  } finally {
    setExportState({ isExporting: false })
  }
}

export const exportMessageToNotion = async (title: string, content: string, message?: Message) => {
  const { notionExportReasoning } = store.getState().settings

  const notionBlocks = await convertMarkdownToNotionBlocks(content)

  if (notionExportReasoning && message) {
    const thinkingContent = getThinkingContent(message)

    if (thinkingContent) {
      const thinkingBlocks = await convertThinkingToNotionBlocks(thinkingContent)

      if (notionBlocks.length > 0) {
        notionBlocks.splice(1, 0, ...thinkingBlocks)
      } else {
        notionBlocks.push(...thinkingBlocks)
      }
    }
  }

  return executeNotionExport(title, notionBlocks)
}

export const exportTopicToNotion = async (topic: Topic) => {
  const { notionExportReasoning } = store.getState().settings

  // 获取话题消息
  const topicRecord = await db.topics.get(topic.id)
  const topicMessages = topicRecord?.messages || []

  // 创建话题标题块
  const titleBlocks = await convertMarkdownToNotionBlocks(`# ${topic.name}`)

  // 为每个消息创建blocks
  const allBlocks: any[] = [...titleBlocks]

  for (const message of topicMessages) {
    // 将单个消息转换为markdown
    const messageMarkdown = messageToMarkdown(message)
    const messageBlocks = await convertMarkdownToNotionBlocks(messageMarkdown)

    if (notionExportReasoning) {
      const thinkingContent = getThinkingContent(message)

      if (thinkingContent) {
        const thinkingBlocks = await convertThinkingToNotionBlocks(thinkingContent)

        if (messageBlocks.length > 0) {
          messageBlocks.splice(1, 0, ...thinkingBlocks)
        } else {
          messageBlocks.push(...thinkingBlocks)
        }
      }
    }

    allBlocks.push(...messageBlocks)
  }

  return executeNotionExport(topic.name, allBlocks)
}

export const exportMarkdownToYuque = async (title: string, content: string) => {
  const { isExporting } = store.getState().runtime.export
  // TODO
  const { yuqueToken, yuqueRepoId } = store.getState().settings

  if (isExporting) {
    Alert.alert(i18n.t('message.warn.yuque.exporting'))
    return
  }

  if (!yuqueToken || !yuqueRepoId) {
    Alert.alert(i18n.t('message.error.yuque.no_config'))
    return
  }

  setExportState({ isExporting: true })

  try {
    const response = await fetch(`https://www.yuque.com/api/v2/repos/${yuqueRepoId}/docs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': yuqueToken,
        'User-Agent': 'CherryAI'
      },
      body: JSON.stringify({
        title: title,
        slug: Date.now().toString(), // 使用时间戳作为唯一slug
        format: 'markdown',
        body: content
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    const doc_id = data.data.id

    const tocResponse = await fetch(`https://www.yuque.com/api/v2/repos/${yuqueRepoId}/toc`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': yuqueToken,
        'User-Agent': 'CherryAI'
      },
      body: JSON.stringify({
        action: 'appendNode',
        action_mode: 'sibling',
        doc_ids: [doc_id]
      })
    })

    if (!tocResponse.ok) {
      throw new Error(`HTTP error! status: ${tocResponse.status}`)
    }

    Alert.alert(i18n.t('message.success.yuque.export'))
    return data
  } catch (error: any) {
    Alert.alert(i18n.t('message.error.yuque.export'))
    return null
  } finally {
    setExportState({ isExporting: false })
  }
}

/**
 * 导出Markdown到Obsidian
 * @param attributes 文档属性
 * @param attributes.title 标题
 * @param attributes.created 创建时间
 * @param attributes.source 来源
 * @param attributes.tags 标签
 * @param attributes.processingMethod 处理方式
 * @param attributes.folder 选择的文件夹路径或文件路径
 * @param attributes.vault 选择的Vault名称
 */
export const exportMarkdownToObsidian = async (attributes: any) => {
  try {
    // 从参数获取Vault名称
    const obsidianVault = attributes.vault
    let obsidianFolder = attributes.folder || ''
    let isMarkdownFile = false

    if (!obsidianVault) {
      Alert.alert(i18n.t('chat.topics.export.obsidian_not_configured'))
      return
    }

    if (!attributes.title) {
      Alert.alert(i18n.t('chat.topics.export.obsidian_title_required'))
      return
    }

    // 检查是否选择了.md文件
    if (obsidianFolder && obsidianFolder.endsWith('.md')) {
      isMarkdownFile = true
    }

    let filePath = ''

    // 如果是.md文件，直接使用该文件路径
    if (isMarkdownFile) {
      filePath = obsidianFolder
    } else {
      // 否则构建路径
      //构建保存路径添加以 / 结尾
      if (obsidianFolder && !obsidianFolder.endsWith('/')) {
        obsidianFolder = obsidianFolder + '/'
      }

      //构建文件名
      const fileName = transformObsidianFileName(attributes.title)
      filePath = obsidianFolder + fileName + '.md'
    }

    let obsidianUrl = `obsidian://new?file=${encodeURIComponent(filePath)}&vault=${encodeURIComponent(obsidianVault)}&clipboard`

    if (attributes.processingMethod === '3') {
      obsidianUrl += '&overwrite=true'
    } else if (attributes.processingMethod === '2') {
      obsidianUrl += '&prepend=true'
    } else if (attributes.processingMethod === '1') {
      obsidianUrl += '&append=true'
    }

    window.open(obsidianUrl)
    Alert.alert(i18n.t('chat.topics.export.obsidian_export_success'))
  } catch (error) {
    console.error('导出到Obsidian失败:', error)
    Alert.alert(i18n.t('chat.topics.export.obsidian_export_failed'))
  }
}

/**
 * 生成Obsidian文件名,源自 Obsidian Web Clipper 官方实现,修改了一些细节
 * @param fileName
 * @returns
 */
function transformObsidianFileName(fileName: string): string {
  const platform = window.navigator.userAgent
  const isWin = /win/i.test(platform)
  const isMac = /mac/i.test(platform)

  // 删除Obsidian 全平台无效字符
  let sanitized = fileName.replace(/[#|\\^\\[\]]/g, '')

  if (isWin) {
    // Windows 的清理
    sanitized = sanitized
      .replace(/[<>:"\\/\\|?*]/g, '') // 移除无效字符
      .replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, '_$1$2') // 避免保留名称
      .replace(/[\s.]+$/, '') // 移除结尾的空格和句点
  } else if (isMac) {
    // Mac 的清理
    sanitized = sanitized
      .replace(/[<>:"\\/\\|?*]/g, '') // 移除无效字符
      .replace(/^\./, '_') // 避免以句点开头
  } else {
    // Linux 或其他系统
    sanitized = sanitized
      .replace(/[<>:"\\/\\|?*]/g, '') // 移除无效字符
      .replace(/^\./, '_') // 避免以句点开头
  }

  // 所有平台的通用操作
  sanitized = sanitized
    .replace(/^\.+/, '') // 移除开头的句点
    .trim() // 移除前后空格
    .slice(0, 245) // 截断为 245 个字符，留出空间以追加 ' 1.md'

  // 确保文件名不为空
  if (sanitized.length === 0) {
    sanitized = 'Untitled'
  }

  return sanitized
}

export const exportMarkdownToJoplin = async (title: string, contentOrMessages: string | Message | Message[]) => {
  // TODO
  const { joplinUrl, joplinToken, joplinExportReasoning } = store.getState().settings

  if (!joplinUrl || !joplinToken) {
    Alert.alert(i18n.t('message.error.joplin.no_config'))
    return
  }

  let content: string

  if (typeof contentOrMessages === 'string') {
    content = contentOrMessages
  } else if (Array.isArray(contentOrMessages)) {
    content = messagesToMarkdown(contentOrMessages, joplinExportReasoning)
  } else {
    // 单条Message
    content = joplinExportReasoning
      ? messageToMarkdownWithReasoning(contentOrMessages)
      : messageToMarkdown(contentOrMessages)
  }

  try {
    const baseUrl = joplinUrl.endsWith('/') ? joplinUrl : `${joplinUrl}/`
    const response = await fetch(`${baseUrl}notes?token=${joplinToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: title,
        body: content,
        source: 'Cherry Studio'
      })
    })

    if (!response.ok) {
      throw new Error('service not available')
    }

    const data = await response.json()

    if (data?.error) {
      throw new Error('response error')
    }

    Alert.alert(i18n.t('message.success.joplin.export'))
    return
  } catch (error) {
    Alert.alert(i18n.t('message.error.joplin.export'))
    return
  }
}

/**
 * 导出Markdown到思源笔记
 * @param title 笔记标题
 * @param content 笔记内容
 */
export const exportMarkdownToSiyuan = async (title: string, content: string) => {
  const { isExporting } = store.getState().runtime.export
  // TODO
  const { siyuanApiUrl, siyuanToken, siyuanBoxId, siyuanRootPath } = store.getState().settings

  if (isExporting) {
    Alert.alert(i18n.t('message.warn.siyuan.exporting'))
    return
  }

  if (!siyuanApiUrl || !siyuanToken || !siyuanBoxId) {
    Alert.alert(i18n.t('message.error.siyuan.no_config'))
    return
  }

  setExportState({ isExporting: true })

  try {
    // test connection
    const testResponse = await fetch(`${siyuanApiUrl}/api/notebook/lsNotebooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${siyuanToken}`
      }
    })

    if (!testResponse.ok) {
      throw new Error('API请求失败')
    }

    const testData = await testResponse.json()

    if (testData.code !== 0) {
      throw new Error(`${testData.msg || i18n.t('message.error.unknown')}`)
    }

    // 确保根路径以/开头
    const rootPath = siyuanRootPath?.startsWith('/') ? siyuanRootPath : `/${siyuanRootPath || 'CherryStudio'}`

    // 创建文档
    const docTitle = `${title.replace(/[#|\\^\\[\]]/g, '')}`
    const docPath = `${rootPath}/${docTitle}`

    // 创建文档
    await createSiyuanDoc(siyuanApiUrl, siyuanToken, siyuanBoxId, docPath, content)

    Alert.alert(i18n.t('message.success.siyuan.export'))
  } catch (error) {
    console.error('导出到思源笔记失败:', error)
    Alert.alert(i18n.t('message.error.siyuan.export') + (error instanceof Error ? `: ${error.message}` : ''))
  } finally {
    setExportState({ isExporting: false })
  }
}

/**
 * 创建思源笔记文档
 */
async function createSiyuanDoc(
  apiUrl: string,
  token: string,
  boxId: string,
  path: string,
  markdown: string
): Promise<string> {
  const response = await fetch(`${apiUrl}/api/filetree/createDocWithMd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token}`
    },
    body: JSON.stringify({
      notebook: boxId,
      path: path,
      markdown: markdown
    })
  })

  const data = await response.json()

  if (data.code !== 0) {
    throw new Error(`${data.msg || i18n.t('message.error.unknown')}`)
  }

  return data.data
}

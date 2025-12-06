import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useToast } from '@/hooks/useToast'
import type { Topic } from '@/types/assistant'
import type { Message } from '@/types/message'
import {
  exportMessageAsMarkdown,
  exportTopicAsMarkdown,
  getTitleFromContent,
  type MarkdownExportOptions
} from '@/utils/export'
import { getMainTextContent } from '@/utils/messageUtils/find'

export interface UseExportReturn {
  /** Whether an export is currently in progress */
  isExporting: boolean
  /** Export a topic as markdown file */
  exportTopic: (topic: Topic, options?: MarkdownExportOptions) => Promise<boolean>
  /** Export a single message as markdown file */
  exportMessage: (message: Message, options?: MarkdownExportOptions) => Promise<boolean>
}

/**
 * Hook for exporting topics and messages as markdown files
 * Provides export state management and toast notifications
 */
export function useExport(): UseExportReturn {
  const { t } = useTranslation()
  const toast = useToast()
  const [isExporting, setIsExporting] = useState(false)

  const exportTopic = async (topic: Topic, options?: MarkdownExportOptions): Promise<boolean> => {
    if (isExporting) {
      toast.show(t('export.already_exporting'))
      return false
    }

    setIsExporting(true)

    try {
      const result = await exportTopicAsMarkdown(topic, options)

      if (result.success) {
        toast.show(t('export.success'))
        return true
      }

      // User cancelled - don't show error
      if (result.message === 'cancelled') {
        return false
      }

      toast.show(t('export.failed'))
      return false
    } catch {
      toast.show(t('export.failed'))
      return false
    } finally {
      setIsExporting(false)
    }
  }

  const exportMessage = async (message: Message, options?: MarkdownExportOptions): Promise<boolean> => {
    if (isExporting) {
      toast.show(t('export.already_exporting'))
      return false
    }

    setIsExporting(true)

    try {
      // Get title from message content
      const content = await getMainTextContent(message)
      const title = getTitleFromContent(content)

      const result = await exportMessageAsMarkdown(message, title, options)

      if (result.success) {
        toast.show(t('export.success'))
        return true
      }

      // User cancelled - don't show error
      if (result.message === 'cancelled') {
        return false
      }

      toast.show(t('export.failed'))
      return false
    } catch {
      toast.show(t('export.failed'))
      return false
    } finally {
      setIsExporting(false)
    }
  }

  return {
    isExporting,
    exportTopic,
    exportMessage
  }
}

import { MotiView } from 'moti'
import React from 'react'
import { useTranslation } from 'react-i18next'

import Text from '@/componentsV2/base/Text'
import Group from '@/componentsV2/layout/Group'
import Row from '@/componentsV2/layout/Row'
import { useWebsearchProviders } from '@/hooks/useWebsearchProviders'
import type { Assistant } from '@/types/assistant'

import { McpServerDropdown } from './McpServerDropdown'
import { ToolUseDropdown } from './ToolUseDropdown'
import { WebsearchDropdown } from './WebsearchDropdown'

interface ToolTabContentProps {
  assistant: Assistant
  updateAssistant: (assistant: Assistant) => Promise<void>
}

export function ToolTabContent({ assistant, updateAssistant }: ToolTabContentProps) {
  const { t } = useTranslation()
  const { apiProviders } = useWebsearchProviders()

  return (
    <MotiView
      style={{ flex: 1 }}
      from={{ opacity: 0, translateY: 10 }}
      animate={{
        translateY: 0,
        opacity: 1
      }}
      exit={{ opacity: 1, translateY: -10 }}
      transition={{
        type: 'timing'
      }}>
      <Group>
        <Row>
          <Text className="text-sm font-medium">{t('assistants.settings.tooluse.title')}</Text>
          <ToolUseDropdown assistant={assistant} updateAssistant={updateAssistant} />
        </Row>

        <Row>
          <Text className="text-sm font-medium">{t('settings.websearch.provider.title')}</Text>
          <WebsearchDropdown
            assistant={assistant}
            updateAssistant={updateAssistant}
            providers={apiProviders.filter(p => p.apiKey)}
          />
        </Row>

        <Row>
          <Text className="text-sm font-medium">{t('mcp.server.title')}</Text>
          <McpServerDropdown assistant={assistant} updateAssistant={updateAssistant} />
        </Row>
      </Group>
    </MotiView>
  )
}

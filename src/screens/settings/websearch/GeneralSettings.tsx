import { Switch } from 'heroui-native'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Group, GroupTitle, Row, Text, TextField, YStack } from '@/componentsV2'
import { useWebsearchSettings } from '@/hooks/useWebsearchProviders'

export default function GeneralSettings() {
  const { t } = useTranslation()

  const {
    searchWithDates,
    overrideSearchService,
    searchCount,
    contentLimit,
    setSearchWithDates,
    setOverrideSearchService,
    setSearchCount,
    setContentLimit
  } = useWebsearchSettings()

  // Local state for input values
  const [searchCountInput, setSearchCountInput] = useState(searchCount.toString())
  const [contentLimitInput, setContentLimitInput] = useState(contentLimit?.toString() || '')

  useEffect(() => {
    setSearchCountInput(searchCount.toString())
  }, [searchCount])

  useEffect(() => {
    setContentLimitInput(contentLimit?.toString() || '')
  }, [contentLimit])

  // Handler for search count validation on blur
  const handleSearchCountEndEditing = () => {
    const numValue = parseInt(searchCountInput, 10)
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 20) {
      setSearchCount(numValue).catch(console.error)
    } else {
      // Reset to current valid value if invalid
      setSearchCountInput(searchCount.toString())
    }
  }

  // Handler for content limit validation on blur
  const handleContentLimitEndEditing = () => {
    const trimmedValue = contentLimitInput.trim()
    if (trimmedValue === '') {
      setContentLimit(undefined).catch(console.error)
    } else {
      const numValue = parseInt(trimmedValue, 10)
      if (!isNaN(numValue) && numValue > 0) {
        setContentLimit(numValue).catch(console.error)
      } else {
        // Reset to current valid value if invalid
        setContentLimitInput(contentLimit?.toString() || '')
      }
    }
  }

  return (
    <YStack className="gap-2 py-2">
      <GroupTitle>{t('settings.general.title')}</GroupTitle>
      <Group>
        <Row>
          <Text>{t('settings.websearch.contentLengthLimit')}</Text>
          <TextField className="max-w-20 flex-1">
            <TextField.Input
              value={contentLimitInput}
              onChangeText={setContentLimitInput}
              onEndEditing={handleContentLimitEndEditing}
              keyboardType="numeric"
            />
          </TextField>
        </Row>
        <Row>
          <Text>{t('settings.websearch.searchCount')}</Text>
          <TextField className="max-w-20 flex-1">
            <TextField.Input
              value={searchCountInput}
              onChangeText={setSearchCountInput}
              onEndEditing={handleSearchCountEndEditing}
              keyboardType="numeric"
            />
          </TextField>
        </Row>

        <Row>
          <Text>{t('settings.websearch.searchWithDates')}</Text>
          <Switch color="success" isSelected={searchWithDates} onSelectedChange={setSearchWithDates}>
            <Switch.Thumb colors={{ defaultBackground: 'white', selectedBackground: 'white' }} />
          </Switch>
        </Row>
        <Row>
          <Text>{t('settings.websearch.overrideSearchService')}</Text>
          <Switch color="success" isSelected={overrideSearchService} onSelectedChange={setOverrideSearchService}>
            <Switch.Thumb colors={{ defaultBackground: 'white', selectedBackground: 'white' }} />
          </Switch>
        </Row>
      </Group>
    </YStack>
  )
}

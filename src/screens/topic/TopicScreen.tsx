import { useNavigation } from '@react-navigation/native'
import { PenSquare } from '@tamagui/lucide-icons'
import debounce from 'lodash/debounce'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { useTheme } from 'tamagui'

import { SettingContainer } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import { GroupedTopicList } from '@/components/topic/GroupTopicList'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { SearchInput } from '@/components/ui/SearchInput'
import { useTopics } from '@/hooks/useTopic'
import { getDefaultAssistant } from '@/services/AssistantService'
import { createNewTopic } from '@/services/TopicService'
import { NavigationProps } from '@/types/naviagate'

export default function TopicScreen() {
  const { t } = useTranslation()
  const theme = useTheme()
  const navigation = useNavigation<NavigationProps>()
  const { topics, isLoading } = useTopics()

  // 搜索状态
  const [searchText, setSearchText] = useState('')
  const [debouncedSearchText, setDebouncedSearchText] = useState('')

  // 防抖处理
  const debouncedSetSearchText = useCallback(
    debounce((text: string) => {
      setDebouncedSearchText(text)
    }, 300),
    []
  )

  useEffect(() => {
    debouncedSetSearchText(searchText)
    return () => {
      debouncedSetSearchText.cancel()
    }
  }, [searchText, debouncedSetSearchText])

  // 搜索过滤话题
  const filteredTopics = topics.filter(topic => {
    if (!debouncedSearchText) return true
    
    const query = debouncedSearchText.toLowerCase().trim()
    if (!query) return true
    
    return (
      (topic.name && topic.name.toLowerCase().includes(query)) ||
      (topic.id && topic.id.toLowerCase().includes(query))
    )
  })

  const handleAddNewTopic = async () => {
    const defaultAssistant = await getDefaultAssistant()
    const newTopic = await createNewTopic(defaultAssistant)
    navigation.navigate('ChatScreen', { topicId: newTopic.id })
  }

  if (isLoading) {
    return (
      <SafeAreaContainer style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer style={{ flex: 1, backgroundColor: theme.background.val }}>
      <HeaderBar
        title={t('topics.title.recent')}
        onBackPress={() => navigation.goBack()}
        rightButton={{
          icon: <PenSquare size={24} />,
          onPress: handleAddNewTopic
        }}
      />
      <SettingContainer>
        <SearchInput 
          placeholder={t('common.search_placeholder')} 
          value={searchText}
          onChangeText={setSearchText}
        />
        <GroupedTopicList topics={filteredTopics} />
      </SettingContainer>
    </SafeAreaContainer>
  )
}

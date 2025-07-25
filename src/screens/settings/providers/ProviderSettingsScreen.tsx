import BottomSheet from '@gorhom/bottom-sheet'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { ChevronRight, HeartPulse, Plus, Settings, Settings2 } from '@tamagui/lucide-icons'
import { groupBy } from 'lodash'
import debounce from 'lodash/debounce'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { Accordion, Button, Separator, Text, XStack, YStack } from 'tamagui'

import { SettingContainer, SettingGroup, SettingGroupTitle, SettingRow } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import { AddModelSheet } from '@/components/settings/providers/AddModelSheet'
import { ModelGroup } from '@/components/settings/providers/ModelGroup'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { SearchInput } from '@/components/ui/SearchInput'
import { CustomSwitch } from '@/components/ui/Switch'
import { useProvider } from '@/hooks/useProviders'
import { loggerService } from '@/services/LoggerService'
import { Model } from '@/types/assistant'
import { NavigationProps, RootStackParamList } from '@/types/naviagate'
import { useIsDark } from '@/utils'
import { getGreenColor } from '@/utils/color'
const logger = loggerService.withContext('ProviderSettingsScreen')

type ProviderSettingsRouteProp = RouteProp<RootStackParamList, 'ProviderSettingsScreen'>

export default function ProviderSettingsScreen() {
  const { t } = useTranslation()
  const isDark = useIsDark()
  const navigation = useNavigation<NavigationProps>()
  const route = useRoute<ProviderSettingsRouteProp>()

  const bottomSheetRef = useRef<BottomSheet>(null)
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false)
  
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

  const handleOpenBottomSheet = () => {
    bottomSheetRef.current?.expand()
    setIsBottomSheetOpen(true)
  }

  const handleBottomSheetClose = () => {
    setIsBottomSheetOpen(false)
  }

  const { providerId } = route.params
  const { provider, isLoading, updateProvider } = useProvider(providerId)

  const modelGroups = groupBy(provider?.models, 'group')

  // 搜索过滤模型
  const filteredModelGroups = Object.fromEntries(
    Object.entries(modelGroups).map(([groupName, models]) => [
      groupName,
      models.filter(model => {
        if (!debouncedSearchText) return true
        
        const query = debouncedSearchText.toLowerCase().trim()
        if (!query) return true
        
        return (
          (model.name && model.name.toLowerCase().includes(query)) ||
          (model.id && model.id.toLowerCase().includes(query))
        )
      })
    ]).filter(([, models]) => models.length > 0) // 过滤掉空分组
  )

  // 对分组进行排序
  const sortedModelGroups = Object.entries(filteredModelGroups).sort(([a], [b]) => a.localeCompare(b))

  // 默认展开前6个分组
  const defaultOpenGroups = sortedModelGroups.slice(0, 6).map((_, index) => `item-${index}`)

  const onAddModel = () => {
    // 添加模型逻辑
    handleOpenBottomSheet()
  }

  const onManageModel = () => {
    // 管理模型逻辑
    navigation.navigate('ManageModelsScreen', { providerId })
  }

  const onApiService = () => {
    navigation.navigate('ApiServiceScreen', { providerId })
  }

  const onSettingModel = (model: Model) => {
    logger.info('[ProviderSettingsPage] onSettingModel', model)
  }

  const handleEnabledChange = async (checked: boolean) => {
    if (provider) {
      const updatedProvider = { ...provider, enabled: checked }

      try {
        await updateProvider(updatedProvider)
      } catch (error) {
        logger.error('Failed to save provider:', error)
      }
    }
  }

  if (isLoading) {
    return (
      <SafeAreaContainer style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaContainer>
    )
  }

  if (!provider) {
    return (
      <SafeAreaContainer>
        <HeaderBar title={t('settings.provider.not_found')} onBackPress={() => navigation.goBack()} />
        <SettingContainer>
          <Text textAlign="center" color="$gray10" paddingVertical={24}>
            {t('settings.provider.not_found_message')}
          </Text>
        </SettingContainer>
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer>
      <HeaderBar
        title={provider.name}
        onBackPress={() => navigation.goBack()}
        rightButtons={[
          {
            icon: <Settings2 size={24} />,
            onPress: onManageModel
          },
          {
            icon: <Plus size={24} />,
            onPress: onAddModel
          }
        ]}
      />

      <SettingContainer>
        <KeyboardAwareScrollView
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1 }}>
          <YStack flex={1} gap={24}>
            {/* Auth Card */}
            {/* <AuthCard provider={provider} /> */}

            {/* Manage Card */}
            <YStack gap={8}>
              <SettingGroupTitle>{t('common.manage')}</SettingGroupTitle>
              <SettingGroup>
                <SettingRow>
                  <Text>{t('common.enabled')}</Text>
                  <CustomSwitch checked={provider.enabled} onCheckedChange={handleEnabledChange} />
                </SettingRow>
                <SettingRow onPress={onApiService}>
                  <Text>{t('settings.provider.api_service')}</Text>
                  <XStack justifyContent="center" alignItems="center">
                    {provider.apiKey && provider.apiHost && (
                      <Text
                        paddingVertical={2}
                        paddingHorizontal={8}
                        borderRadius={8}
                        backgroundColor={getGreenColor(isDark, 10)}
                        borderColor={getGreenColor(isDark, 20)}
                        color={getGreenColor(isDark, 100)}
                        borderWidth={0.5}
                        fontWeight="bold"
                        fontSize={12}>
                        {t('settings.provider.added')}
                      </Text>
                    )}
                    <ChevronRight color="$white9" width={6} height={12} />
                  </XStack>
                </SettingRow>
              </SettingGroup>
            </YStack>

            <Separator />

            {/* Search Card */}
            <SearchInput 
              placeholder={t('settings.models.search')} 
              value={searchText}
              onChangeText={setSearchText}
            />

            {/* Model List Card with Accordion */}
            <YStack flex={1}>
              <XStack justifyContent="space-between" alignItems="center" marginBottom={16}>
                <SettingGroupTitle>{t('settings.models.title')}</SettingGroupTitle>
                <Button size={14} chromeless icon={<HeartPulse size={14} />} />
              </XStack>

              {sortedModelGroups.length > 0 ? (
                <Accordion overflow="hidden" type="multiple" defaultValue={defaultOpenGroups}>
                  {sortedModelGroups.map(
                    (
                      [groupName, modelsInGroup],
                      index // Renamed models to modelsInGroup to avoid conflict
                    ) => (
                      <ModelGroup
                        key={groupName}
                        groupName={groupName}
                        models={modelsInGroup as Model[]} // Type assertion for modelsInGroup
                        index={index}
                        renderModelButton={(
                          model: Model // Wrap with useCallback
                        ) => (
                          <Button
                            size={14}
                            chromeless
                            icon={<Settings size={14} />}
                            onPress={() => onSettingModel(model)}
                          />
                        )} // Add onSettingModel to dependency array
                      />
                    )
                  )}
                </Accordion>
              ) : (
                <Text textAlign="center" color="$gray10" paddingVertical={24}>
                  {t('models.no_models')}
                </Text>
              )}
            </YStack>
          </YStack>
        </KeyboardAwareScrollView>
      </SettingContainer>

      <AddModelSheet bottomSheetRef={bottomSheetRef} isOpen={isBottomSheetOpen} onClose={handleBottomSheetClose} />
    </SafeAreaContainer>
  )
}

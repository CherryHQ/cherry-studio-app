import BottomSheet from '@gorhom/bottom-sheet'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { ChevronRight, HeartPulse, Plus, Settings, Settings2 } from '@tamagui/lucide-icons'
import { debounce, groupBy } from 'lodash'
import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { Accordion, Button, Separator, Text, XStack, YStack } from 'tamagui'

import { SettingContainer, SettingGroup, SettingGroupTitle, SettingRow } from '@/components/settings'
import { HeaderBar } from '@/components/settings/HeaderBar'
import { AddModelSheet } from '@/components/settings/providers/AddModelSheet'
import AuthCard from '@/components/settings/providers/AuthCard'
import { ModelGroup } from '@/components/settings/providers/ModelGroup'
import SafeAreaContainer from '@/components/ui/SafeAreaContainer'
import { SearchInput } from '@/components/ui/SearchInput'
import { CustomSwitch } from '@/components/ui/Switch'
import { useProvider } from '@/hooks/useProviders'
import { Model, Provider } from '@/types/assistant'
import { NavigationProps, RootStackParamList } from '@/types/naviagate'

type ProviderSettingsRouteProp = RouteProp<RootStackParamList, 'ProviderSettingsScreen'>

export default function ProviderSettingsScreen() {
  const { t } = useTranslation()
  const navigation = useNavigation<NavigationProps>()
  const route = useRoute<ProviderSettingsRouteProp>()
  const [searchText, setSearchText] = useState('')
  const [debouncedSearchText, setDebouncedSearchText] = useState('')

  const bottomSheetRef = useRef<BottomSheet>(null)
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false)

  const handleOpenBottomSheet = () => {
    bottomSheetRef.current?.expand()
    setIsBottomSheetOpen(true)
  }

  const handleBottomSheetClose = () => {
    setIsBottomSheetOpen(false)
  }

  const { providerId } = route.params
  const { provider, isLoading, updateProvider } = useProvider(providerId)

  // Debounce search text
  const debouncedSetSearchText = debounce(setDebouncedSearchText, 300)

  React.useEffect(() => {
    debouncedSetSearchText(searchText)

    return () => {
      debouncedSetSearchText.cancel()
    }
  }, [searchText, debouncedSetSearchText])

  // 根据搜索文本过滤和分组模型
  const getModelGroups = (debouncedSearchText: string, provider: Provider | null) => {
    if (!provider) return {}
    const filteredModels = debouncedSearchText // Use debouncedSearchText
      ? provider.models.filter(model => model.name.toLowerCase().includes(debouncedSearchText.toLowerCase()))
      : provider.models
    return groupBy(filteredModels, 'group')
  }

  const modelGroups = getModelGroups(debouncedSearchText, provider)

  // 对分组进行排序
  const sortedModelGroups = Object.entries(modelGroups).sort(([a], [b]) => a.localeCompare(b))

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
    console.log('[ProviderSettingsPage] onSettingModel', model)
  }

  const handleEnabledChange = async (checked: boolean) => {
    if (provider) {
      const updatedProvider = { ...provider, enabled: checked }

      try {
        await updateProvider(updatedProvider)
      } catch (error) {
        console.error('Failed to save provider:', error)
      }
    }
  }

  if (isLoading) {
    return (
      <SafeAreaContainer>
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
          extraScrollHeight={300}
          enableOnAndroid={true}
          contentContainerStyle={{ flexGrow: 1 }}>
          <YStack flex={1} gap={24}>
            {/* Auth Card */}
            <AuthCard provider={provider} />

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
                  <XStack>
                    {provider.checked && (
                      <Text
                        paddingVertical={2}
                        paddingHorizontal={8}
                        borderRadius={8}
                        backgroundColor="$gray4"
                        fontWeight="bold"
                        fontSize={14}>
                        {t('settings.provider.checked')}
                      </Text>
                    )}
                    <ChevronRight color="$white9" width={6} height={12} />
                  </XStack>
                </SettingRow>
              </SettingGroup>
            </YStack>

            <Separator />

            {/* Search Card */}
            <SearchInput placeholder={t('settings.models.search')} value={searchText} onChangeText={setSearchText} />

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
                        models={modelsInGroup} // Use modelsInGroup
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
                  {searchText ? t('settings.models.no_results') : t('models.no_models')}
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

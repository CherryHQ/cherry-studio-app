import type { RouteProp } from '@react-navigation/native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { Spinner, Switch } from 'heroui-native'
import { groupBy } from 'lodash'
import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollView } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'

import {
  Container,
  Group,
  GroupTitle,
  HeaderBar,
  IconButton,
  ModelGroup,
  PressableRow,
  Row,
  RowRightArrow,
  SafeAreaContainer,
  SearchInput,
  Text,
  XStack,
  YStack
} from '@/componentsV2'
import { presentDialog } from '@/componentsV2/base/Dialog/useDialogManager'
import { ModelTags } from '@/componentsV2/features/ModelTags'
import { presentAddModelSheet } from '@/componentsV2/features/SettingsScreen/providers/AddModelSheet'
import { ProviderSelect } from '@/componentsV2/features/SettingsScreen/providers/ProviderSelect'
import { ModelIcon } from '@/componentsV2/icons'
import {
  CircleCheck,
  HeartPulse,
  ListCheck,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  XCircle
} from '@/componentsV2/icons/LucideIcon'
import { useProvider } from '@/hooks/useProviders'
import { useSearch } from '@/hooks/useSearch'
import { useTheme } from '@/hooks/useTheme'
import type { ProvidersStackParamList } from '@/navigators/settings/ProvidersStackNavigator'
import { loggerService } from '@/services/LoggerService'
import { modelHealthService } from '@/services/ModelHealthService'
import { providerService } from '@/services/ProviderService'
import type { Model, ModelHealth, ProviderType } from '@/types/assistant'
import type { ProvidersNavigationProps } from '@/types/naviagate'

const logger = loggerService.withContext('ProviderSettingsScreen')

type ProviderSettingsRouteProp = RouteProp<ProvidersStackParamList, 'ProviderSettingsScreen'>

export default function ProviderSettingsScreen() {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const navigation = useNavigation<ProvidersNavigationProps>()
  const route = useRoute<ProviderSettingsRouteProp>()

  const [healthResults, setHealthResults] = useState<Record<string, ModelHealth>>({})
  const [isCheckingHealth, setIsCheckingHealth] = useState(false)

  const { providerId } = route.params
  const { provider, isLoading, updateProvider } = useProvider(providerId)

  // Use the search hook for filtering models
  const allModels = provider?.models || []
  const {
    searchText,
    setSearchText,
    filteredItems: searchFilteredModels
  } = useSearch(
    allModels,
    useCallback((model: Model) => [model.name || '', model.id || ''], []),
    { delay: 100 }
  )

  // 使用 groupBy 对过滤后的模型按 group 字段分组
  const modelGroups = groupBy(searchFilteredModels, 'group')

  // Convert to entries and filter empty groups
  const filteredModelGroups = Object.fromEntries(Object.entries(modelGroups).filter(([, models]) => models.length > 0))

  // 对分组进行排序
  const sortedModelGroups = Object.entries(filteredModelGroups).sort(([a], [b]) => a.localeCompare(b))

  const onAddModel = () => {
    if (provider) {
      presentAddModelSheet(provider, updateProvider)
    }
  }

  const onManageModel = () => {
    navigation.navigate('ManageModelsScreen', { providerId, providerName: provider?.name ?? '' })
  }

  const onApiService = () => {
    navigation.navigate('ApiServiceScreen', { providerId })
  }

  const onDeleteProvider = () => {
    presentDialog('error', {
      title: t('settings.provider.delete.title'),
      content: t('settings.provider.delete.content'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      showCancel: true,
      onConfirm: async () => {
        await providerService.deleteProvider(providerId)
        navigation.goBack()
      }
    })
  }

  const handleHealthCheck = async () => {
    if (!provider || isCheckingHealth) return

    setIsCheckingHealth(true)
    setHealthResults({})

    try {
      // Initialize all models as testing
      const initialResults: Record<string, ModelHealth> = {}
      allModels.forEach(model => {
        initialResults[model.id] = {
          modelId: model.id,
          status: 'testing'
        }
      })
      setHealthResults(initialResults)

      // Check models one by one
      for (const model of allModels) {
        try {
          const result = await modelHealthService.checkModelHealth(provider, model)
          setHealthResults(prev => ({
            ...prev,
            [model.id]: result
          }))
        } catch (error) {
          logger.error(`Failed to check model ${model.id}:`, error as Error)
          setHealthResults(prev => ({
            ...prev,
            [model.id]: {
              modelId: model.id,
              status: 'unhealthy',
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          }))
        }
      }
    } finally {
      setIsCheckingHealth(false)
    }
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

  const handleProviderTypeChange = async (type: ProviderType) => {
    if (provider) {
      const updatedProvider = { ...provider, type }

      try {
        await updateProvider(updatedProvider)
      } catch (error) {
        logger.error('Failed to save provider:', error)
      }
    }
  }

  const handleRemoveModel = useCallback(
    async (modelId: string) => {
      if (provider) {
        const updatedModels = provider.models.filter(model => model.id !== modelId)
        const updatedProvider = { ...provider, models: updatedModels }

        try {
          await updateProvider(updatedProvider)
          logger.info(`Removed model ${modelId} from provider ${provider.id}`)
        } catch (error) {
          logger.error('Failed to remove model:', error)
        }
      }
    },
    [provider, updateProvider]
  )

  const renderModelItem = useCallback(
    (model: Model, _index: number) => {
      const health = healthResults[model.id]

      const getStatusIcon = () => {
        if (!health) return null

        switch (health.status) {
          case 'healthy':
            return <CircleCheck size={16} className="primary-text" />
          case 'unhealthy':
            return <XCircle size={16} className="text-red-600" />
          case 'testing':
            return <Spinner size="sm" color={isDark ? '#ffffff' : '#000000'} />
          default:
            return null
        }
      }

      return (
        <YStack className="w-full gap-1">
          <XStack className="w-full items-center justify-between">
            <XStack className="flex-1 gap-2">
              <XStack className="items-center justify-center">
                <ModelIcon model={model} size={24} />
              </XStack>
              <YStack className="flex-1 gap-1">
                <Text className="text-sm leading-none" numberOfLines={1} ellipsizeMode="tail">
                  {model.name}
                </Text>
                <ModelTags model={model} size={11} />
              </YStack>
            </XStack>
            <XStack className="items-center gap-2">
              {health && health.latency != null && (
                <Text className="text-foreground-secondary font-mono text-xs">{health.latency.toFixed(2)}s</Text>
              )}
              {getStatusIcon()}
              <IconButton
                icon={<Minus size={18} className="rounded-full bg-red-600/20 text-red-600" />}
                onPress={() => handleRemoveModel(model.id)}
              />
            </XStack>
          </XStack>
          {health?.error && health.status === 'unhealthy' && (
            <Text className="text-xs text-red-600" numberOfLines={2}>
              {health.error}
            </Text>
          )}
        </YStack>
      )
    },
    [healthResults, isDark, handleRemoveModel]
  )

  if (isLoading) {
    return (
      <SafeAreaContainer className="flex-1">
        <YStack />
      </SafeAreaContainer>
    )
  }

  if (!provider) {
    return (
      <SafeAreaContainer className="flex-1">
        <HeaderBar title={t('settings.provider.not_found')} />
        <Container className="flex-1">
          <Text className="py-6 text-center text-gray-500">{t('settings.provider.not_found_message')}</Text>
        </Container>
      </SafeAreaContainer>
    )
  }

  return (
    <SafeAreaContainer className="flex-1">
      <HeaderBar
        title={t(`provider.${provider.id}`, { defaultValue: provider.name })}
        rightButtons={[
          ...(!provider.isSystem
            ? [
                {
                  icon: <Trash2 size={24} />,
                  onPress: onDeleteProvider
                }
              ]
            : []),
          {
            icon: <ListCheck size={24} />,
            onPress: onManageModel
          }
        ]}
      />

      <Container className="pb-0" onStartShouldSetResponder={() => false} onMoveShouldSetResponder={() => false}>
        <KeyboardAvoidingView className="flex-1">
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled">
            <YStack className="flex-1 gap-6">
              {/* Auth Card */}
              {/* <AuthCard provider={provider} /> */}

              {/* Manage Card */}
              <YStack className="gap-2">
                <GroupTitle>{t('common.manage')}</GroupTitle>
                <Group>
                  <Row>
                    <Text>{t('common.enabled')}</Text>
                    <Switch isSelected={provider.enabled} onSelectedChange={handleEnabledChange}></Switch>
                  </Row>
                  <Row>
                    <Text className="w-1/3">{t('settings.provider.add.type')}</Text>
                    <ProviderSelect
                      value={provider.type}
                      onValueChange={handleProviderTypeChange}
                      placeholder={t('settings.provider.add.type')}
                    />
                  </Row>
                  <PressableRow onPress={onApiService}>
                    <Text>{t('settings.provider.api_service')}</Text>
                    <XStack className="items-center justify-center">
                      {provider.apiKey && provider.apiHost && (
                        <Text className="primary-badge rounded-md border-[0.5px] px-2 py-0.5 text-xs">
                          {t('settings.provider.added')}
                        </Text>
                      )}
                      <RowRightArrow />
                    </XStack>
                  </PressableRow>
                </Group>
              </YStack>

              {/* Model List Card with Accordion */}
              <YStack className="flex-1 gap-2">
                <XStack className="items-center justify-between pr-2.5">
                  <GroupTitle>{t('settings.models.title')}</GroupTitle>
                  <XStack className="items-center gap-2">
                    <IconButton
                      icon={
                        isCheckingHealth ? <RefreshCw size={18} className="animate-spin" /> : <HeartPulse size={18} />
                      }
                      onPress={handleHealthCheck}
                      disabled={isCheckingHealth}
                    />
                    <IconButton icon={<Plus size={18} />} onPress={onAddModel} />
                  </XStack>
                </XStack>
                <SearchInput
                  placeholder={t('settings.models.search')}
                  value={searchText}
                  onChangeText={setSearchText}
                />
                <Group>
                  <ModelGroup modelGroups={sortedModelGroups} renderModelItem={renderModelItem} />
                </Group>
              </YStack>
            </YStack>
          </ScrollView>
        </KeyboardAvoidingView>
      </Container>
    </SafeAreaContainer>
  )
}

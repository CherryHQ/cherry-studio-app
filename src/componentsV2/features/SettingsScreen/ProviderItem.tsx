import { useNavigation } from '@react-navigation/native'
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { SFSymbol } from 'sf-symbols-typescript'

import ContextMenu from '@/componentsV2/base/ContextMenu'
import Text from '@/componentsV2/base/Text'
import { Edit3, ProviderIcon, Trash2 } from '@/componentsV2/icons'
import RowRightArrow from '@/componentsV2/layout/Row/RowRightArrow'
import XStack from '@/componentsV2/layout/XStack'
import { useDialog } from '@/hooks/useDialog'
import { useToast } from '@/hooks/useToast'
import { deleteProvider } from '@/services/ProviderService'
import type { Provider } from '@/types/assistant'
import type { ProvidersNavigationProps } from '@/types/naviagate'

interface ProviderItemProps {
  provider: Provider
  mode?: 'enabled' | 'checked' // Add mode prop to distinguish display modes
  onEdit?: (provider: Provider) => void
}

export const ProviderItem: React.FC<ProviderItemProps> = ({ provider, mode = 'enabled', onEdit }) => {
  const { t } = useTranslation()
  const navigation = useNavigation<ProvidersNavigationProps>()
  const dialog = useDialog()
  const toast = useToast()

  // Determine display conditions and text based on mode
  const shouldShowStatus = mode === 'enabled' ? provider.enabled : provider.apiKey
  const statusText = mode === 'enabled' ? t('settings.provider.enabled') : t('settings.provider.added')

  const handleEdit = () => {
    onEdit?.(provider)
  }

  const handleDelete = () => {
    dialog.open({
      type: 'error',
      title: t('settings.provider.delete.title'),
      content: t('settings.provider.delete.content'),
      confirmText: t('common.delete'),
      cancelText: t('common.cancel'),
      onConFirm: async () => {
        try {
          await deleteProvider(provider.id)
          toast.show(t('settings.provider.provider_deleted'))
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : t('common.unknown_error')
          toast.show(t('common.error_occurred') + '\n' + errorMessage)
        }
      }
    })
  }

  const handlePress = () => {
    navigation.navigate('ProviderSettingsScreen', { providerId: provider.id })
  }

  const providerRow = (
    <XStack className="items-center justify-between px-4 py-3">
      <XStack className="items-center gap-2">
        <ProviderIcon provider={provider} />
        <Text className="text-lg text-text-primary dark:text-text-primary-dark">
          {t(`provider.${provider.id}`, { defaultValue: provider.name })}
        </Text>
      </XStack>
      <XStack className="items-center gap-2.5">
        {shouldShowStatus && (
          <Text className="rounded-lg border-[0.5px] border-green-20 bg-green-10 px-2 py-0.5 text-sm text-green-100 dark:border-green-dark-20 dark:bg-green-dark-10 dark:text-green-dark-100">
            {statusText}
          </Text>
        )}
        <RowRightArrow />
      </XStack>
    </XStack>
  )

  const contextMenuList = [
    {
      title: t('common.edit'),
      onSelect: handleEdit,
      iOSIcon: 'pencil' as SFSymbol,
      androidIcon: <Edit3 size={16} />
    },
    {
      title: t('common.delete'),
      onSelect: handleDelete,
      destructive: true,
      iOSIcon: 'trash' as SFSymbol,
      androidIcon: <Trash2 size={16} color="red" />,
      color: 'red'
    }
  ]

  return (
    <ContextMenu list={contextMenuList} onPress={handlePress} disableContextMenu={provider.isSystem}>
      {providerRow}
    </ContextMenu>
  )
}

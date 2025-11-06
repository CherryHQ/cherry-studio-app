import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import * as Clipboard from 'expo-clipboard'
import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, ScrollView, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Text, XStack, YStack } from '@/componentsV2'
import { Copy } from '@/componentsV2/icons/LucideIcon'
import { useTheme } from '@/hooks/useTheme'
import { getHttpMessageLabel } from '@/i18n/label'
import type { SerializedAiSdkError, SerializedAiSdkErrorUnion, SerializedError } from '@/types/error'
import {
  isSerializedAiSdkAPICallError,
  isSerializedAiSdkDownloadError,
  isSerializedAiSdkError,
  isSerializedAiSdkErrorUnion,
  isSerializedAiSdkInvalidArgumentError,
  isSerializedAiSdkInvalidDataContentError,
  isSerializedAiSdkInvalidMessageRoleError,
  isSerializedAiSdkInvalidPromptError,
  isSerializedAiSdkInvalidToolInputError,
  isSerializedAiSdkJSONParseError,
  isSerializedAiSdkMessageConversionError,
  isSerializedAiSdkNoObjectGeneratedError,
  isSerializedAiSdkNoSpeechGeneratedError,
  isSerializedAiSdkNoSuchModelError,
  isSerializedAiSdkNoSuchProviderError,
  isSerializedAiSdkNoSuchToolError,
  isSerializedAiSdkRetryError,
  isSerializedAiSdkToolCallRepairError,
  isSerializedAiSdkTooManyEmbeddingValuesForCallError,
  isSerializedAiSdkTypeValidationError,
  isSerializedAiSdkUnsupportedFunctionalityError,
  isSerializedError
} from '@/types/error'
import type { ErrorMessageBlock, Message } from '@/types/message'
import { formatAiSdkError, formatError, safeToString } from '@/utils/error'

const HTTP_ERROR_CODES = [400, 401, 403, 404, 429, 500, 502, 503, 504]

interface Props {
  block: ErrorMessageBlock
  message: Message
}

const ErrorBlock: React.FC<Props> = ({ block, message }) => {
  const sheetRef = useRef<BottomSheetModal>(null)

  const handleShowDetail = useCallback(() => {
    sheetRef.current?.present()
  }, [])

  return (
    <>
      <MessageErrorInfo block={block} message={message} onShowDetail={handleShowDetail} />
      <ErrorDetailSheet ref={sheetRef} error={block.error} />
    </>
  )
}

const ErrorMessage: React.FC<{ block: ErrorMessageBlock }> = ({ block }) => {
  const { t, i18n } = useTranslation()

  const i18nKey = block.error && 'i18nKey' in block.error ? `error.${block.error?.i18nKey}` : ''
  const errorKey = `error.${block.error?.message}`
  const errorStatus =
    block.error && ('status' in block.error || 'statusCode' in block.error)
      ? block.error?.status || block.error?.statusCode
      : undefined

  if (i18n.exists(i18nKey)) {
    const providerId = block.error && 'providerId' in block.error ? block.error?.providerId : undefined

    if (providerId && typeof providerId === 'string') {
      return (
        <></>
        // <Trans
        //   i18nKey={i18nKey}
        //   values={{ provider: getProviderLabel(providerId) }}
        //   components={{
        //     provider: (
        //       <Link
        //         style={{ color: 'var(--color-link)' }}
        //         to={`/settings/provider`}
        //         state={{ provider: getProviderById(providerId) }}
        //       />
        //     )
        //   }}
        // />
      )
    }
  }

  if (i18n.exists(errorKey)) {
    return t(errorKey)
  }

  if (typeof errorStatus === 'number' && HTTP_ERROR_CODES.includes(errorStatus)) {
    return (
      <h5>
        {getHttpMessageLabel(errorStatus.toString())} {block.error?.message}
      </h5>
    )
  }

  return block.error?.message || ''
}

const MessageErrorInfo: React.FC<{ block: ErrorMessageBlock; message: Message; onShowDetail: () => void }> = ({
  block,
  onShowDetail
}) => {
  const { t } = useTranslation()

  const getAlertDescription = () => {
    const status =
      block.error && ('status' in block.error || 'statusCode' in block.error)
        ? block.error?.status || block.error?.statusCode
        : undefined

    if (block.error && typeof status === 'number' && HTTP_ERROR_CODES.includes(status)) {
      return getHttpMessageLabel(status.toString())
    }

    return <ErrorMessage block={block} />
  }

  return (
    <TouchableOpacity
      className="my-1.5 rounded-lg border border-red-200 bg-red-50 p-4 active:bg-red-100"
      onPress={onShowDetail}>
      <XStack className="w-full items-center justify-between gap-2">
        <Text className="flex-1 text-red-600" numberOfLines={1}>
          {getAlertDescription()}
        </Text>
        <Text className="text-sm text-red-500">{t('common.detail')}</Text>
      </XStack>
    </TouchableOpacity>
  )
}

interface ErrorDetailSheetProps {
  error?: SerializedError
}

const renderBackdrop = (props: any) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} pressBehavior="close" />
)

const ErrorDetailSheet = forwardRef<BottomSheetModal, ErrorDetailSheetProps>(({ error }, ref) => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const [copiedText, setCopiedText] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      ;(ref as React.RefObject<BottomSheetModal>)?.current?.dismiss()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [ref, isVisible])

  const copyErrorDetails = async () => {
    if (!error) return
    let errorText: string

    if (isSerializedAiSdkError(error)) {
      errorText = formatAiSdkError(error)
    } else if (isSerializedError(error)) {
      errorText = formatError(error)
    } else {
      errorText = safeToString(error)
    }

    await Clipboard.setStringAsync(errorText)
    setCopiedText(true)
    setTimeout(() => setCopiedText(false), 2000)
  }

  const renderErrorDetails = (error?: SerializedError) => {
    if (!error) return <Text>{t('error.unknown')}</Text>

    if (isSerializedAiSdkErrorUnion(error)) {
      return <AiSdkError error={error} />
    }

    return <BuiltinError error={error} />
  }

  return (
    <BottomSheetModal
      ref={ref}
      backdropComponent={renderBackdrop}
      enableDynamicSizing={false}
      snapPoints={['50%', '75%', '90%']}
      backgroundStyle={{
        borderRadius: 30,
        backgroundColor: isDark ? '#121213ff' : '#f7f7f7ff'
      }}
      handleIndicatorStyle={{
        backgroundColor: isDark ? '#f9f9f9ff' : '#202020ff'
      }}
      onDismiss={() => setIsVisible(false)}
      onChange={index => setIsVisible(index >= 0)}>
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}>
        <YStack className="gap-4 px-5 pt-2.5">
          <XStack className="items-center justify-between">
            <Text className="text-xl font-semibold">{t('error.detail')}</Text>
            <TouchableOpacity
              className={`flex-row items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 ${!error ? 'opacity-50' : ''}`}
              onPress={copyErrorDetails}
              disabled={!error}>
              <Copy className="h-4 w-4" />
              <Text className="text-sm">{copiedText ? t('common.copied') : t('common.copy')}</Text>
            </TouchableOpacity>
          </XStack>
          <View className="h-px bg-gray-200" />
          {renderErrorDetails(error)}
        </YStack>
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

ErrorDetailSheet.displayName = 'ErrorDetailSheet'

// Error detail components
const ErrorDetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  return (
    <YStack className="gap-2">
      <Text className="text-sm font-semibold text-gray-600">{label}:</Text>
      {children}
    </YStack>
  )
}

const ErrorDetailValue: React.FC<{ children: React.ReactNode; isCode?: boolean }> = ({ children, isCode = false }) => {
  return (
    <View className="rounded-md border border-gray-200 bg-gray-100 p-2">
      <Text className={`text-xs text-gray-900 ${isCode ? 'font-mono' : ''}`}>{children}</Text>
    </View>
  )
}

const StackTrace: React.FC<{ stack: string }> = ({ stack }) => {
  return (
    <View className="rounded-md border border-red-300 bg-red-50 p-3">
      <Text className="font-mono text-xs leading-5 text-red-700">{stack}</Text>
    </View>
  )
}

const JsonViewer: React.FC<{ data: any }> = ({ data }) => {
  const formatted = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="rounded-lg border border-gray-200 bg-gray-100 p-2">
        <Text className="font-mono text-xs text-gray-900">{formatted}</Text>
      </View>
    </ScrollView>
  )
}

const BuiltinError = ({ error }: { error: SerializedError }) => {
  const { t } = useTranslation()
  return (
    <YStack className="gap-4">
      {error.name && (
        <ErrorDetailItem label={t('error.name')}>
          <ErrorDetailValue>{error.name}</ErrorDetailValue>
        </ErrorDetailItem>
      )}
      {error.message && (
        <ErrorDetailItem label={t('error.message')}>
          <ErrorDetailValue>{error.message}</ErrorDetailValue>
        </ErrorDetailItem>
      )}
      {error.stack && (
        <ErrorDetailItem label={t('error.stack')}>
          <StackTrace stack={error.stack} />
        </ErrorDetailItem>
      )}
    </YStack>
  )
}

const AiSdkErrorBase = ({ error }: { error: SerializedAiSdkError }) => {
  const { t } = useTranslation()
  return (
    <YStack className="gap-4">
      <BuiltinError error={error} />
      {error.cause && (
        <ErrorDetailItem label={t('error.cause')}>
          <ErrorDetailValue>{error.cause}</ErrorDetailValue>
        </ErrorDetailItem>
      )}
    </YStack>
  )
}

const AiSdkError = ({ error }: { error: SerializedAiSdkErrorUnion }) => {
  const { t } = useTranslation()

  return (
    <YStack className="gap-4">
      <AiSdkErrorBase error={error} />

      {(isSerializedAiSdkAPICallError(error) || isSerializedAiSdkDownloadError(error)) && (
        <>
          {error.statusCode && (
            <ErrorDetailItem label={t('error.statusCode')}>
              <ErrorDetailValue>{error.statusCode}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.url && (
            <ErrorDetailItem label={t('error.requestUrl')}>
              <ErrorDetailValue>{error.url}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkAPICallError(error) && (
        <>
          {error.requestBodyValues && (
            <ErrorDetailItem label={t('error.requestBodyValues')}>
              <JsonViewer data={error.requestBodyValues} />
            </ErrorDetailItem>
          )}

          {error.responseHeaders && (
            <ErrorDetailItem label={t('error.responseHeaders')}>
              <JsonViewer data={error.responseHeaders} />
            </ErrorDetailItem>
          )}

          {error.responseBody && (
            <ErrorDetailItem label={t('error.responseBody')}>
              <JsonViewer data={error.responseBody} />
            </ErrorDetailItem>
          )}

          {error.data && (
            <ErrorDetailItem label={t('error.data')}>
              <JsonViewer data={error.data} />
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkDownloadError(error) && (
        <>
          {error.statusText && (
            <ErrorDetailItem label={t('error.statusText')}>
              <ErrorDetailValue>{error.statusText}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkInvalidArgumentError(error) && (
        <>
          {error.parameter && (
            <ErrorDetailItem label={t('error.parameter')}>
              <ErrorDetailValue>{error.parameter}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {(isSerializedAiSdkInvalidArgumentError(error) || isSerializedAiSdkTypeValidationError(error)) && (
        <>
          {error.value && (
            <ErrorDetailItem label={t('error.value')}>
              <ErrorDetailValue>{safeToString(error.value)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkInvalidDataContentError(error) && (
        <ErrorDetailItem label={t('error.content')}>
          <ErrorDetailValue>{safeToString(error.content)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidMessageRoleError(error) && (
        <ErrorDetailItem label={t('error.role')}>
          <ErrorDetailValue>{error.role}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidPromptError(error) && (
        <ErrorDetailItem label={t('error.prompt')}>
          <ErrorDetailValue>{safeToString(error.prompt)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkInvalidToolInputError(error) && (
        <>
          {error.toolName && (
            <ErrorDetailItem label={t('error.toolName')}>
              <ErrorDetailValue>{error.toolName}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.toolInput && (
            <ErrorDetailItem label={t('error.toolInput')}>
              <ErrorDetailValue>{error.toolInput}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {(isSerializedAiSdkJSONParseError(error) || isSerializedAiSdkNoObjectGeneratedError(error)) && (
        <ErrorDetailItem label={t('error.text')}>
          <ErrorDetailValue>{error.text}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkMessageConversionError(error) && (
        <ErrorDetailItem label={t('error.originalMessage')}>
          <ErrorDetailValue>{safeToString(error.originalMessage)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkNoSpeechGeneratedError(error) && (
        <ErrorDetailItem label={t('error.responses')}>
          <ErrorDetailValue>{error.responses.join(', ')}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkNoObjectGeneratedError(error) && (
        <>
          {error.response && (
            <ErrorDetailItem label={t('error.response')}>
              <ErrorDetailValue>{safeToString(error.response)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.usage && (
            <ErrorDetailItem label={t('error.usage')}>
              <ErrorDetailValue>{safeToString(error.usage)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.finishReason && (
            <ErrorDetailItem label={t('error.finishReason')}>
              <ErrorDetailValue>{error.finishReason}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {(isSerializedAiSdkNoSuchModelError(error) ||
        isSerializedAiSdkNoSuchProviderError(error) ||
        isSerializedAiSdkTooManyEmbeddingValuesForCallError(error)) && (
        <ErrorDetailItem label={t('error.modelId')}>
          <ErrorDetailValue>{error.modelId}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {(isSerializedAiSdkNoSuchModelError(error) || isSerializedAiSdkNoSuchProviderError(error)) && (
        <ErrorDetailItem label={t('error.modelType')}>
          <ErrorDetailValue>{error.modelType}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkNoSuchProviderError(error) && (
        <>
          <ErrorDetailItem label={t('error.providerId')}>
            <ErrorDetailValue>{error.providerId}</ErrorDetailValue>
          </ErrorDetailItem>

          <ErrorDetailItem label={t('error.availableProviders')}>
            <ErrorDetailValue>{error.availableProviders.join(', ')}</ErrorDetailValue>
          </ErrorDetailItem>
        </>
      )}

      {isSerializedAiSdkNoSuchToolError(error) && (
        <>
          <ErrorDetailItem label={t('error.toolName')}>
            <ErrorDetailValue>{error.toolName}</ErrorDetailValue>
          </ErrorDetailItem>
          {error.availableTools && (
            <ErrorDetailItem label={t('error.availableTools')}>
              <ErrorDetailValue>{error.availableTools?.join(', ') || t('common.none')}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkRetryError(error) && (
        <>
          {error.reason && (
            <ErrorDetailItem label={t('error.reason')}>
              <ErrorDetailValue>{error.reason}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.lastError && (
            <ErrorDetailItem label={t('error.lastError')}>
              <ErrorDetailValue>{safeToString(error.lastError)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.errors && error.errors.length > 0 && (
            <ErrorDetailItem label={t('error.errors')}>
              <ErrorDetailValue>{error.errors.map(e => safeToString(e)).join('\n\n')}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkTooManyEmbeddingValuesForCallError(error) && (
        <>
          {error.provider && (
            <ErrorDetailItem label={t('error.provider')}>
              <ErrorDetailValue>{error.provider}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.maxEmbeddingsPerCall && (
            <ErrorDetailItem label={t('error.maxEmbeddingsPerCall')}>
              <ErrorDetailValue>{error.maxEmbeddingsPerCall}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
          {error.values && (
            <ErrorDetailItem label={t('error.values')}>
              <ErrorDetailValue>{safeToString(error.values)}</ErrorDetailValue>
            </ErrorDetailItem>
          )}
        </>
      )}

      {isSerializedAiSdkToolCallRepairError(error) && (
        <ErrorDetailItem label={t('error.originalError')}>
          <ErrorDetailValue>{safeToString(error.originalError)}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {isSerializedAiSdkUnsupportedFunctionalityError(error) && (
        <ErrorDetailItem label={t('error.functionality')}>
          <ErrorDetailValue>{error.functionality}</ErrorDetailValue>
        </ErrorDetailItem>
      )}
    </YStack>
  )
}

export default React.memo(ErrorBlock)

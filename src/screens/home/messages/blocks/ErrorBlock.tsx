import { TrueSheet } from '@lodev09/react-native-true-sheet'
import * as Clipboard from 'expo-clipboard'
import { Button } from 'heroui-native'
import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BackHandler, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Text, XStack, YStack } from '@/componentsV2'
import { Bug, Copy } from '@/componentsV2/icons/LucideIcon'
import { usePreference } from '@/hooks/usePreference'
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
import { isIOS26 } from '@/utils/device'
import { formatAiSdkError, formatError, safeToString } from '@/utils/error'

const HTTP_ERROR_CODES = [400, 401, 403, 404, 429, 500, 502, 503, 504]

const SHEET_NAME = 'error-detail-sheet'

// Global state for error
let currentError: SerializedError | undefined
let updateErrorCallback: ((error: SerializedError | undefined) => void) | null = null

export const presentErrorDetailSheet = (error: SerializedError | undefined) => {
  currentError = error
  updateErrorCallback?.(error)
  return TrueSheet.present(SHEET_NAME)
}

export const dismissErrorDetailSheet = () => TrueSheet.dismiss(SHEET_NAME)

interface Props {
  block: ErrorMessageBlock
  message: Message
}

const ErrorBlock: React.FC<Props> = ({ block, message }) => {
  const handleShowDetail = useCallback(() => {
    presentErrorDetailSheet(block.error)
  }, [block.error])

  return <MessageErrorInfo block={block} message={message} onShowDetail={handleShowDetail} />
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
    <Pressable
      className="rounded-lg  border border-red-600/20 bg-red-600/10 p-2"
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      onPress={onShowDetail}>
      <XStack className="w-full items-center justify-between gap-2">
        <Text className="flex-1 text-red-600" numberOfLines={1}>
          {getAlertDescription()}
        </Text>
        <Text className="text-sm text-red-600">{t('common.detail')}</Text>
      </XStack>
    </Pressable>
  )
}

// Error detail components
const ErrorDetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  return (
    <YStack className="gap-2">
      <Text className="text-sm">{label}:</Text>
      {children}
    </YStack>
  )
}

const ErrorDetailValue: React.FC<{ children: React.ReactNode; isCode?: boolean }> = ({ children }) => {
  return (
    <View className="border-foreground rounded-md border-[0.5px] p-2">
      <Text className="text-xs">{children}</Text>
    </View>
  )
}

const StackTrace: React.FC<{ stack: string }> = ({ stack }) => {
  return (
    <View className="rounded-md border border-red-600/20 bg-red-600/10 p-3">
      <Text className="font-mono text-xs leading-5 text-red-600">{stack}</Text>
    </View>
  )
}

const JsonViewer: React.FC<{ data: any }> = ({ data }) => {
  const formatted = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="border-zinc-400/200 rounded-lg border bg-zinc-400 p-2">
        <Text className="font-mono text-xs text-gray-900">{formatted}</Text>
      </View>
    </ScrollView>
  )
}

const BuiltinError = ({ error, developerMode }: { error: SerializedError; developerMode: boolean }) => {
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
      {developerMode && error.stack && (
        <ErrorDetailItem label={t('error.stack')}>
          <StackTrace stack={error.stack} />
        </ErrorDetailItem>
      )}
    </YStack>
  )
}

const AiSdkErrorBase = ({ error, developerMode }: { error: SerializedAiSdkError; developerMode: boolean }) => {
  const { t } = useTranslation()
  return (
    <YStack className="gap-4">
      <BuiltinError error={error} developerMode={developerMode} />
      {developerMode && error.cause && (
        <ErrorDetailItem label={t('error.cause')}>
          <ErrorDetailValue>{error.cause}</ErrorDetailValue>
        </ErrorDetailItem>
      )}
    </YStack>
  )
}

const AiSdkError = ({ error, developerMode }: { error: SerializedAiSdkErrorUnion; developerMode: boolean }) => {
  const { t } = useTranslation()

  return (
    <YStack className="gap-4">
      <AiSdkErrorBase error={error} developerMode={developerMode} />

      {/* Always show: statusCode, url */}
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

      {/* Always show: providerId */}
      {isSerializedAiSdkNoSuchProviderError(error) && (
        <ErrorDetailItem label={t('error.providerId')}>
          <ErrorDetailValue>{error.providerId}</ErrorDetailValue>
        </ErrorDetailItem>
      )}

      {/* Developer mode only fields */}
      {developerMode && (
        <>
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
            <ErrorDetailItem label={t('error.availableProviders')}>
              <ErrorDetailValue>{error.availableProviders.join(', ')}</ErrorDetailValue>
            </ErrorDetailItem>
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
        </>
      )}
    </YStack>
  )
}

const ErrorDetails: React.FC<{ error?: SerializedError; developerMode: boolean }> = ({ error, developerMode }) => {
  const { t } = useTranslation()

  if (!error) return <Text>{t('error.unknown')}</Text>

  if (isSerializedAiSdkErrorUnion(error)) {
    return <AiSdkError error={error} developerMode={developerMode} />
  }
  return <BuiltinError error={error} developerMode={developerMode} />
}

export const ErrorDetailSheet: React.FC = () => {
  const { t } = useTranslation()
  const { isDark } = useTheme()
  const insets = useSafeAreaInsets()
  const [developerMode, setDeveloperMode] = usePreference('app.developer_mode')
  const [isVisible, setIsVisible] = useState(false)
  const [error, setError] = useState<SerializedError | undefined>(currentError)

  useEffect(() => {
    updateErrorCallback = setError
    return () => {
      updateErrorCallback = null
    }
  }, [])

  useEffect(() => {
    if (!isVisible) return

    const backAction = () => {
      dismissErrorDetailSheet()
      return true
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction)
    return () => backHandler.remove()
  }, [isVisible])

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
  }

  const toggleDeveloperMode = async () => {
    await setDeveloperMode(!developerMode)
  }

  const header = (
    <XStack className="items-center justify-between px-5 pb-4 pt-5">
      <Text className="text-foreground text-xl font-semibold">{t('error.detail')}</Text>
      <XStack className="gap-1">
        <Button pressableFeedbackVariant="ripple" variant="ghost" isIconOnly onPress={toggleDeveloperMode}>
          <Bug size={20} className={developerMode ? 'primary-text' : undefined} />
        </Button>
        <Button
          pressableFeedbackVariant="ripple"
          variant="ghost"
          isIconOnly
          onPress={copyErrorDetails}
          isDisabled={!error}>
          <Copy size={20} />
        </Button>
      </XStack>
    </XStack>
  )

  return (
    <TrueSheet
      name={SHEET_NAME}
      detents={['auto', 0.5, 0.9]}
      cornerRadius={30}
      grabber
      dismissible
      dimmed
      scrollable
      backgroundColor={isIOS26 ? undefined : isDark ? '#19191c' : '#ffffff'}
      header={header}
      onDidDismiss={() => setIsVisible(false)}
      onDidPresent={() => setIsVisible(true)}>
      <View className="flex-1">
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 20, paddingHorizontal: 20, paddingTop: 8 }}
          nestedScrollEnabled={Platform.OS === 'android'}
          showsVerticalScrollIndicator={false}>
          <ErrorDetails error={error} developerMode={developerMode} />
        </ScrollView>
      </View>
    </TrueSheet>
  )
}

ErrorDetailSheet.displayName = 'ErrorDetailSheet'

export default React.memo(ErrorBlock)

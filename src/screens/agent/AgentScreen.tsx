import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, FlatList, Modal, Pressable, TextInput, View } from 'react-native'

import { aiSdkToolToAgentTool } from '@/agent/toolAdapter'
import { type AgentMessageView, type AgentToolRunView,usePiAgent } from '@/agent/usePiAgent'
import { SystemTool } from '@/aiCore/tools/SystemTools'
import { SafeAreaContainer, Text, XStack, YStack } from '@/componentsV2'
import { providerService } from '@/services/ProviderService'
import type { Model, Provider } from '@/types/assistant'

function isFunctionCallingModel(model: Model): boolean {
  return (
    model.capabilities?.some(cap => cap.type === 'function_calling') === true ||
    model.type?.includes('function_calling') === true
  )
}

type ListItem =
  | { kind: 'message'; message: AgentMessageView }
  | { kind: 'tool'; run: AgentToolRunView }

function ToolRunCard({ run }: { run: AgentToolRunView }) {
  const statusColor = run.status === 'running' ? 'bg-blue-500' : run.status === 'error' ? 'bg-red-500' : 'bg-green-500'
  return (
    <View className="my-1 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
      <XStack className="items-center gap-2">
        <View className={`h-2 w-2 rounded-full ${statusColor}`} />
        <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100">{run.name}</Text>
        {run.status === 'running' && <ActivityIndicator size="small" className="ml-auto" />}
      </XStack>
      {Object.keys(run.args).length > 0 && (
        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">{JSON.stringify(run.args)}</Text>
      )}
      {run.resultText ? (
        <Text className="mt-1 text-xs text-slate-600 dark:text-slate-300" numberOfLines={6}>
          {run.resultText}
        </Text>
      ) : null}
    </View>
  )
}

export default function AgentScreen() {
  const { t } = useTranslation()
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [selectedModel, setSelectedModel] = useState<Model | null>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [input, setInput] = useState('')

  useEffect(() => {
    providerService
      .getAllProviders()
      .then(all => {
        const enabled = all.filter(p => p.enabled && p.models.length > 0)
        setProviders(enabled)
        const candidate =
          enabled.find(p => p.models.some(isFunctionCallingModel)) ?? enabled.find(p => p.models.length > 0)
        if (candidate) {
          const model = candidate.models.find(isFunctionCallingModel) ?? candidate.models[0]
          setSelectedProvider(candidate)
          setSelectedModel(model)
        }
      })
      .catch(() => {
        // providers 加载失败时保持空态
      })
  }, [])

  // 工具面：复用项目现有的手机系统工具（提醒 / 日历 / 时间 / 网络 / 快捷指令）
  const tools = useMemo(
    () => Object.entries(SystemTool).map(([name, tool]) => aiSdkToolToAgentTool(name, tool)),
    []
  )

  const { messages, toolRuns, running, send, abort, reset } = usePiAgent(selectedModel, selectedProvider, tools)

  const items = useMemo<ListItem[]>(() => {
    const list: ListItem[] = []
    for (const run of toolRuns) list.push({ kind: 'tool', run })
    for (const message of messages) list.push({ kind: 'message', message })
    return list
  }, [messages, toolRuns])

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text) return
    setInput('')
    void send(text)
  }, [input, send])

  return (
    <SafeAreaContainer>
      {/* 标题栏 */}
      <YStack className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <XStack className="items-center justify-between">
          <Text className="text-lg font-bold text-slate-900 dark:text-slate-100">{t('agent.title')}</Text>
          <Pressable
            className="rounded-lg bg-blue-600 px-3 py-1.5"
            onPress={() => setPickerVisible(true)}
            disabled={providers.length === 0}
          >
            <Text className="text-sm font-medium text-white">
              {selectedModel ? selectedModel.name : t('agent.selectModel')}
            </Text>
          </Pressable>
        </XStack>
      </YStack>

      {/* 消息与工具轨迹 */}
      <FlatList
        className="flex-1 px-4"
        data={items}
        keyExtractor={(item, index) => `${item.kind}-${index}`}
        renderItem={({ item }) => {
          if (item.kind === 'tool') return <ToolRunCard run={item.run} />
          const message = item.message
          const isUser = message.role === 'user'
          return (
            <View
              className={`my-1 max-w-[85%] rounded-2xl px-4 py-2 ${
                isUser
                  ? 'self-end rounded-br-sm bg-blue-600'
                  : 'self-start rounded-bl-sm bg-slate-200 dark:bg-slate-700'
              }`}
            >
              <Text className={isUser ? 'text-white' : 'text-slate-900 dark:text-slate-100'}>
                {message.text}
                {message.streaming ? '▍' : ''}
              </Text>
            </View>
          )
        }}
        ListEmptyComponent={
          <View className="mt-10 items-center">
            <Text className="text-center text-sm text-slate-400">{t('agent.empty')}</Text>
          </View>
        }
      />

      {/* 输入区 */}
      <YStack className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
        {running && (
          <XStack className="mb-2 items-center justify-center gap-2">
            <ActivityIndicator size="small" />
            <Text className="text-sm text-slate-500">{t('agent.running')}</Text>
          </XStack>
        )}
        <XStack className="items-center gap-2">
          <TextInput
            className="flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            value={input}
            onChangeText={setInput}
            placeholder={t('agent.inputPlaceholder')}
            placeholderTextColor="#94a3b8"
            multiline
            onSubmitEditing={handleSend}
          />
          {running ? (
            <Pressable className="rounded-xl bg-slate-500 px-4 py-2.5" onPress={abort}>
              <Text className="font-medium text-white">{t('agent.stop')}</Text>
            </Pressable>
          ) : (
            <Pressable className="rounded-xl bg-blue-600 px-4 py-2.5" onPress={handleSend}>
              <Text className="font-medium text-white">{t('agent.send')}</Text>
            </Pressable>
          )}
        </XStack>
        <Pressable className="mt-2 self-end" onPress={reset}>
          <Text className="text-xs text-slate-400">{t('agent.clear')}</Text>
        </Pressable>
      </YStack>

      {/* 模型选择 */}
      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setPickerVisible(false)}>
          <View className="mt-auto max-h-[60%] rounded-t-3xl bg-white p-4 dark:bg-slate-900">
            <Text className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">{t('agent.selectModel')}</Text>
            <FlatList
              data={providers}
              keyExtractor={provider => provider.id}
              renderItem={({ item: provider }) => (
                <View className="mb-3">
                  <Text className="mb-1 text-sm font-semibold text-slate-500 dark:text-slate-400">{provider.name}</Text>
                  {provider.models
                    .filter(isFunctionCallingModel)
                    .map(model => (
                      <Pressable
                        key={model.id}
                        className="rounded-lg px-3 py-2 active:bg-slate-100 dark:active:bg-slate-800"
                        onPress={() => {
                          setSelectedProvider(provider)
                          setSelectedModel(model)
                          setPickerVisible(false)
                        }}
                      >
                        <Text className="text-slate-800 dark:text-slate-100">{model.name}</Text>
                      </Pressable>
                    ))}
                </View>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaContainer>
  )
}

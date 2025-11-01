import type { Assistant } from '@/types/assistant'

export function groupByCategories(data: Assistant[]) {
  const groupedMap = new Map<string, Assistant[]>()
  data.forEach(item => {
    item.group?.forEach(category => {
      if (!groupedMap.has(category)) {
        groupedMap.set(category, [])
      }

      groupedMap.get(category)?.push(item)
    })
  })
  const result: Record<string, Assistant[]> = {}
  Array.from(groupedMap.entries()).forEach(([category, items]) => {
    result[category] = items
  })
  return result
}

export const isToolUseModeFunction = (assistant: Assistant) => {
  return assistant.settings?.toolUseMode === 'function'
}

# Dialog Migration: useDialog → DialogManager

## 1. New Implementation

**Location:** `src/componentsV2/base/Dialog/`

### API

```typescript
import { presentDialog, dismissDialog } from '@/componentsV2'

// 显示 dialog
presentDialog('info', { title, content, onConfirm, ... })
presentDialog('error', { title, content, showCancel, ... })
presentDialog('warning', { title, content, ... })
presentDialog('success', { title, content, ... })

// 关闭 dialog
dismissDialog()
```

### DialogProps Interface

```typescript
interface DialogProps {
  title: string
  content: string
  confirmText?: string
  onConfirm?: () => void | Promise<void>
  showCancel?: boolean
  cancelText?: string
  onCancel?: () => void
}

type DialogType = 'info' | 'error' | 'warning' | 'success'
```

### Features

- **自动 Loading 管理**: `onConfirm` 返回 Promise 时自动显示 spinner
- **单实例模式**: 同时只显示一个 dialog
- **4 种类型**: info (cyan), error (red), warning (amber), success (green)
- **全局调用**: 无需在组件中添加 dialog 组件

---

## 2. Dialog Types Color Mapping

| Type      | Color           | Use Case                    |
| --------- | --------------- | --------------------------- |
| `info`    | Cyan (#22d3ee)  | Informational messages      |
| `error`   | Red (#f87171)   | Errors, destructive actions |
| `warning` | Amber (#fbbf24) | Risky operations            |
| `success` | Green (#4ade80) | Positive confirmations      |

---

## 3. Usage Examples

### Simple Info Dialog

```typescript
presentDialog('info', {
  title: t('settings.data.app_data'),
  content: `Location: ${path}`
})
```

### Confirmation with Cancel

```typescript
presentDialog('warning', {
  title: t('settings.data.reset'),
  content: t('settings.data.reset_warning'),
  showCancel: true,
  onConfirm: async () => {
    await resetData()
  }
})
```

### Error with Async Action

```typescript
presentDialog('error', {
  title: t('common.delete'),
  content: t('confirm.delete_message'),
  showCancel: true,
  confirmText: t('common.delete'),
  onConfirm: async () => {
    await deleteItem() // 自动显示 loading，完成后自动关闭
  }
})
```

### Chained Dialogs

```typescript
presentDialog('info', {
  title: t('check.title'),
  content: t('check.confirm'),
  showCancel: true,
  onConfirm: async () => {
    const result = await checkApi()
    if (result.valid) {
      presentDialog('success', {
        title: t('check.success'),
        content: t('check.success_message')
      })
    } else {
      presentDialog('error', {
        title: t('check.fail'),
        content: result.error
      })
    }
  }
})
```

---

## 4. Migration Steps Per File

1. Remove `useDialog` import
2. Add `presentDialog` import from `@/componentsV2`
3. Replace `dialog.open({ type, ... })` with `presentDialog(type, { ... })`
4. Replace `onConFirm` with `onConfirm` (fix typo)
5. Remove `showLoading: true` (auto-managed)
6. Remove `maskClosable: false` (auto-disabled during loading)

### Before

```typescript
import { useDialog } from '@/hooks/useDialog'

const dialog = useDialog()

dialog.open({
  type: 'warning',
  title: t('settings.data.reset'),
  content: t('settings.data.reset_warning'),
  showLoading: true,
  onConFirm: async () => {
    await resetData()
  }
})
```

### After

```typescript
import { presentDialog } from '@/componentsV2'

presentDialog('warning', {
  title: t('settings.data.reset'),
  content: t('settings.data.reset_warning'),
  showCancel: true,
  onConfirm: async () => {
    await resetData()
  }
})
```

---

## 5. Completed Migrations

### Screens

| File                                                                 | Status |
| -------------------------------------------------------------------- | ------ |
| `src/screens/settings/data/BasicDataSettingsScreen.tsx`              | ✅     |
| `src/screens/settings/websearch/WebSearchProviderSettingsScreen.tsx` | ✅     |
| `src/screens/topic/TopicScreen.tsx`                                  | ✅     |
| `src/screens/settings/data/DataSettingsScreen.tsx`                   | ✅     |
| `src/screens/settings/providers/AddProviderScreen.tsx`               | ✅     |
| `src/screens/settings/providers/ApiServiceScreen.tsx`                | ✅     |
| `src/screens/settings/personal/PersonalScreen.tsx`                   | ✅     |
| `src/screens/assistant/AssistantScreen.tsx`                          | ✅     |
| `src/screens/settings/data/Landrop/QRCodeScanner.tsx`                | ✅     |
| `src/screens/settings/data/Landrop/LandropSettingsScreen.tsx`        | ✅     |

### Hooks

| File                              | Status |
| --------------------------------- | ------ |
| `src/hooks/useAppUpdate.ts`       | ✅     |
| `src/hooks/useMessageActions.tsx` | ✅     |
| `src/hooks/useRestore.ts`         | ✅     |

### Components

| File                                                                | Status |
| ------------------------------------------------------------------- | ------ |
| `src/componentsV2/features/AppUpdate/UpdateChecker.tsx`             | ✅     |
| `src/componentsV2/features/TopicList/index.tsx`                     | ✅     |
| `src/componentsV2/features/TopicItem/index.tsx`                     | ✅     |
| `src/componentsV2/features/ChatScreen/MessageInput/VoiceButton.tsx` | ✅     |
| `src/componentsV2/features/SettingsScreen/ProviderIconButton.tsx`   | ✅     |
| `src/componentsV2/features/SettingsScreen/ProviderItem.tsx`         | ✅     |
| `src/componentsV2/base/ExternalLink/index.tsx`                      | ✅     |

---

## 6. Global Changes After Full Migration

- [x] DialogManager registered in `src/App.tsx`
- [ ] Remove `DialogProvider` from `src/App.tsx`
- [ ] Delete `src/hooks/useDialog.tsx`

---

## 7. Known Limitations

### Custom React Content

The current DialogManager only supports string content. The following file has a TODO to use a Sheet component instead:

- `src/screens/settings/providers/ApiServiceScreen.tsx` - Model selection dialog uses custom React component

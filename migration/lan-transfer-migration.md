# 局域网传输迁移计划

> 从 QR Code + Socket.IO 迁移到 Zeroconf + TCP

## 1. 背景

### 1.1 现有方案 (Landrop)

| 组件 | 技术 | 说明 |
|------|------|------|
| 设备发现 | QR Code 扫描 | 桌面端生成二维码，移动端扫描获取连接信息 |
| 文件传输 | Socket.IO (WebSocket) | 通过 WebSocket 分块传输 ZIP 文件 |
| 关键文件 | `LandropSettingsScreen.tsx`, `QRCodeScanner.tsx`, `Overlay.tsx` | |
| Hook | `useWebSocket.ts` | 管理 Socket.IO 连接和文件接收 |

**存在的问题：**
- 需要扫描二维码，用户体验差
- Socket.IO 协议开销大
- 没有二进制帧支持，传输效率低

### 1.2 新方案 (LAN Transfer)

| 组件 | 技术 | 说明 |
|------|------|------|
| 设备发现 | Zeroconf/mDNS | 自动发现局域网内的设备 |
| 文件传输 | TCP + 二进制帧 | 高效的二进制协议 |
| 关键文件 | `ZeroconfTestScreen.tsx`, `LanTransferService.ts` | |
| Hook | `useLanTransfer.ts` | TCP 服务器状态和文件传输管理 |

**优势：**
- 自动设备发现，无需扫描二维码
- 二进制帧传输，效率更高
- 流式写入 + 增量哈希，内存友好
- 完整的超时和错误处理

---

## 2. 迁移目标

1. **保留现有 UI/UX 流程**：保持 RestoreProgressModal 和恢复步骤不变
2. **替换底层传输**：Socket.IO → TCP 二进制协议
3. **替换设备发现**：QR Code → Zeroconf 服务发布
4. **复用现有恢复逻辑**：`useRestore` hook 和 `BackupService`

---

## 3. 迁移架构

### 3.1 新旧对比

```
旧架构：
┌─────────────┐    QR Code    ┌─────────────┐    Socket.IO    ┌─────────────┐
│  桌面端      │ ─────────────>│  移动端      │<───────────────>│ WebSocket   │
│  (发送方)    │               │  (接收方)    │                 │ 文件传输    │
└─────────────┘               └─────────────┘                 └─────────────┘

新架构：
┌─────────────┐   mDNS 发现   ┌─────────────┐    TCP Binary   ┌─────────────┐
│  桌面端      │<─────────────>│  移动端      │<───────────────>│ TCP Server  │
│  (发送方)    │               │  (接收方)    │                 │ 二进制帧    │
└─────────────┘               └─────────────┘                 └─────────────┘
```

### 3.2 组件映射

| 旧组件 | 新组件 | 说明 |
|--------|--------|------|
| `QRCodeScanner.tsx` | 删除 | 不再需要 QR 扫描 |
| `Overlay.tsx` | 删除 | 不再需要扫描遮罩 |
| `useWebSocket.ts` | `useLanTransfer.ts` | 已存在，需要增强 |
| `LandropSettingsScreen.tsx` | `LanTransferScreen.tsx` | 重构主界面 |

---

## 4. 详细任务清单

### Phase 1: 增强 LAN Transfer 状态管理

#### 1.1 修改类型定义

**文件**: `src/types/lanTransfer.ts`

```typescript
// 在 LanTransferState 接口中添加：
export interface LanTransferState {
  status: LanTransferServerStatus
  logs: LanTransferLogEntry[]
  connectedClient?: LanTransferClientInfo
  lastError?: string
  fileTransfer?: FileTransferProgress
  completedFilePath?: string  // 新增：成功传输后的文件路径
}
```

#### 1.2 修改 LanTransferService

**文件**: `src/services/LanTransferService.ts`

当前问题：`completeTransfer()` 成功时将 `fileTransfer` 设为 `undefined`，导致文件路径丢失。

修改 `completeTransfer()` 方法（约 line 768）：
```typescript
this.updateState({
  status: LanTransferServerStatus.CONNECTED,
  fileTransfer: success ? undefined : { ...this.getTransferProgress()!, error },
  completedFilePath: success ? filePath : undefined  // 新增
})
```

添加清除方法：
```typescript
public clearCompletedFile = () => {
  this.updateState({ completedFilePath: undefined })
}
```

#### 1.3 增强 useLanTransfer Hook

**文件**: `src/hooks/useLanTransfer.ts`

```typescript
return {
  ...state,
  isServerRunning,
  isReceivingFile,
  startServer: lanTransferService.startServer,
  stopServer: lanTransferService.stopServer,
  clearLogs: lanTransferService.clearLogs,
  clearCompletedFile: lanTransferService.clearCompletedFile  // 新增
}
```

**预估改动**：~20 行

### Phase 2: 创建新的 LAN Transfer 屏幕

**新文件**: `src/screens/settings/data/LanTransfer/LanTransferScreen.tsx`

#### 2.1 组件结构

```typescript
import { LANDROP_RESTORE_STEPS, useRestore } from '@/hooks/useRestore'
import { useLanTransfer } from '@/hooks/useLanTransfer'
import Zeroconf from 'react-native-zeroconf'

export default function LanTransferScreen() {
  // Zeroconf 服务发布
  const zeroconfRef = useRef<Zeroconf | null>(null)
  const publishedServiceNameRef = useRef<string | null>(null)

  // LAN Transfer 状态
  const {
    startServer,
    stopServer,
    status: serverStatus,
    connectedClient,
    fileTransfer,
    completedFilePath,
    clearCompletedFile,
    lastError
  } = useLanTransfer()

  // 恢复流程（复用 Landrop 配置）
  const {
    isModalOpen,
    restoreSteps,
    overallStatus,
    startRestore,
    closeModal,
    updateStepStatus,
    openModal
  } = useRestore({
    stepConfigs: LANDROP_RESTORE_STEPS,
    clearBeforeRestore: true
  })
}
```

#### 2.2 核心功能实现

**启动服务：**
```typescript
const handleStartService = () => {
  // 1. 发布 Zeroconf 服务
  const deviceName = Device.deviceName || `Cherry-${Platform.OS}`
  const serviceName = `Cherry Studio (${deviceName})`

  zeroconfRef.current?.publishService('cherrystudio', 'tcp', 'local.', serviceName, 53317, {
    version: '2',
    deviceName,
    platform: Platform.OS,
    appVersion: APP_VERSION
  })
  publishedServiceNameRef.current = serviceName

  // 2. 启动 TCP 服务器
  startServer()
}
```

**文件接收完成后触发恢复：**
```typescript
useEffect(() => {
  if (completedFilePath) {
    // 停止服务
    handleStopService()

    // 更新步骤状态
    updateStepStatus('receive_file', 'completed')

    // 提取文件名用于恢复
    const fileName = completedFilePath.split('/').pop() || 'backup.zip'

    // 启动恢复流程（跳过 modal setup，因为已经打开）
    startRestore({
      name: fileName,
      uri: completedFilePath
    }, true)

    // 清除已完成的文件路径
    clearCompletedFile()
  }
}, [completedFilePath])
```

**文件开始接收时打开 Modal：**
```typescript
useEffect(() => {
  if (serverStatus === LanTransferServerStatus.RECEIVING_FILE && !isModalOpen) {
    openModal()
    updateStepStatus('receive_file', 'in_progress')
  }
}, [serverStatus])
```

#### 2.3 UI 状态映射

| serverStatus | UI 显示 |
|--------------|---------|
| IDLE | "开始接收"按钮 |
| STARTING | "正在启动..." |
| LISTENING | 显示设备名称、IP 地址、等待连接提示 |
| HANDSHAKING | "正在握手..." |
| CONNECTED | 显示发送方设备信息，等待文件 |
| RECEIVING_FILE | 显示进度条、百分比、ETA |
| ERROR | 显示错误信息，允许重试 |

#### 2.4 UI 组件

```tsx
return (
  <SafeAreaContainer>
    <HeaderBar title={t('settings.data.lan_transfer.title')} />
    <Container className="flex-1">
      <YStack className="flex-1 gap-4">
        {/* 状态卡片 */}
        <StatusCard
          status={serverStatus}
          connectedClient={connectedClient}
          lastError={lastError}
        />

        {/* 进度显示（接收中时） */}
        {fileTransfer && (
          <TransferProgress transfer={fileTransfer} />
        )}

        {/* 操作按钮 */}
        <ActionButtons
          onStart={handleStartService}
          onStop={handleStopService}
          canStart={canStart}
          canStop={canStop}
        />
      </YStack>
    </Container>

    {/* 恢复进度 Modal */}
    <RestoreProgressModal
      visible={isModalOpen}
      steps={restoreSteps}
      overallStatus={overallStatus}
      onClose={handleRestoreComplete}
    />
  </SafeAreaContainer>
)
```

**预估改动**：~280 行

### Phase 3: 更新导航配置

#### 3.1 添加路由

**文件**: `src/navigators/settings/DataSourcesStackNavigator.tsx`

```typescript
// 更新 ParamList
export type DataSourcesStackParamList = {
  DataSettingsScreen: undefined
  BasicDataSettingsScreen: undefined
  LandropSettingsScreen: { redirectToHome?: boolean } | undefined  // 保留
  LanTransferScreen: { redirectToHome?: boolean } | undefined      // 新增
  ZeroconfTestScreen: undefined  // 可删除
}

// 添加 Screen
<Stack.Screen name="LanTransferScreen" component={LanTransferScreen} />
```

#### 3.2 更新入口按钮

**文件**: `src/screens/settings/data/DataSettingsScreen.tsx`

```typescript
const handleLanTransfer = () => {
  presentDialog('warning', {
    title: t('settings.data.lan_transfer.warning_title'),
    content: t('settings.data.lan_transfer.warning_content'),
    onConfirm: () => {
      navigation.navigate('LanTransferScreen', { redirectToHome: true })
    }
  })
}
```

#### 3.3 添加 i18n 翻译

**文件**: `src/i18n/locales/zh-CN.json` (及其他语言文件)

```json
{
  "settings.data.lan_transfer": {
    "title": "局域网传输",
    "warning_title": "注意",
    "warning_content": "此操作将清除现有数据并从桌面端恢复。请确保已备份重要数据。",
    "start_service": "开始接收",
    "stop_service": "停止服务",
    "waiting_connection": "等待桌面端连接...",
    "connected": "已连接",
    "receiving": "正在接收文件...",
    "device_name": "设备名称",
    "ip_address": "IP 地址",
    "hint": "请在桌面端 Cherry Studio 中选择此设备发送备份"
  }
}
```

**预估改动**：~40-50 行

### Phase 4: 清理旧代码（建议在稳定运行后执行）

#### 4.1 删除文件

| 文件 | 原因 |
|------|------|
| `src/screens/settings/data/Landrop/QRCodeScanner.tsx` | QR 扫描不再需要 |
| `src/screens/settings/data/Landrop/Overlay.tsx` | 扫描遮罩不再需要 |
| `src/hooks/useWebSocket.ts` | Socket.IO 被 TCP 替代 |
| `src/screens/settings/data/ZeroconfTest/` | 测试屏幕 |

#### 4.2 保留文件（可选）

- `src/screens/settings/data/Landrop/LandropSettingsScreen.tsx` - 作为备用方案

#### 4.3 清理导航

从 `DataSourcesStackNavigator.tsx` 中移除：
- `ZeroconfTestScreen` 路由
- `LandropSettingsScreen` 路由（如果确认不再需要）

### Phase 5: 测试清单

#### 5.1 功能测试

- [ ] Zeroconf 服务发布（iOS/Android）
- [ ] TCP 服务器启动/停止
- [ ] 桌面端能发现移动端服务
- [ ] 握手流程正常
- [ ] 文件传输完整（小文件 <1MB）
- [ ] 文件传输完整（大文件 ~100MB）
- [ ] SHA-256 校验通过
- [ ] 恢复流程触发正确
- [ ] 数据恢复完整

#### 5.2 错误处理测试

- [ ] 网络断开时的处理
- [ ] 传输超时的处理
- [ ] 校验失败的处理
- [ ] 用户取消的处理
- [ ] 存储空间不足的处理

#### 5.3 UI/UX 测试

- [ ] 各状态 UI 显示正确
- [ ] 进度条更新流畅
- [ ] ETA 计算合理
- [ ] 恢复完成后正确导航
- [ ] 错误提示清晰

---

## 5. 文件变更清单

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/screens/settings/data/LanTransfer/LanTransferScreen.tsx` | 新的局域网传输屏幕 (~280 行) |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/types/lanTransfer.ts` | 添加 `completedFilePath` 字段 |
| `src/services/LanTransferService.ts` | 暴露完成文件路径，添加 `clearCompletedFile` 方法 |
| `src/hooks/useLanTransfer.ts` | 暴露 `clearCompletedFile` 方法 |
| `src/navigators/settings/DataSourcesStackNavigator.tsx` | 添加 `LanTransferScreen` 路由 |
| `src/screens/settings/data/DataSettingsScreen.tsx` | 更新入口按钮导航 |
| `src/i18n/locales/*.json` | 添加翻译 key |

### 删除文件（Phase 4）

| 文件 | 说明 |
|------|------|
| `src/screens/settings/data/Landrop/QRCodeScanner.tsx` | QR 扫描组件 |
| `src/screens/settings/data/Landrop/Overlay.tsx` | 扫描遮罩组件 |
| `src/hooks/useWebSocket.ts` | Socket.IO hook |
| `src/screens/settings/data/ZeroconfTest/` | 测试屏幕目录 |

---

## 6. 风险与注意事项

### 6.1 Zeroconf 权限
- iOS：需要本地网络权限（Info.plist 配置）
- Android：需要 INTERNET 权限（已有）

### 6.2 向后兼容
建议暂时保留旧的 Landrop 入口，作为备用方案，直到新方案稳定。

### 6.3 桌面端协调
确保桌面端 (Electron) 也支持：
- Zeroconf 服务发现（bonjour/mdns）
- 协议 v2 二进制帧发送

---

## 7. 执行顺序

```
Phase 1 ──────> Phase 2 ──────> Phase 3 ──────> Phase 5 (测试)
 (状态增强)      (新屏幕)        (导航更新)           │
                                                    │
                                                    ▼
                                            Phase 4 (清理)
                                            (稳定后执行)
```

---

## 8. 附录：关键文件路径

| 类别 | 文件路径 |
|------|----------|
| TCP 服务 | `src/services/LanTransferService.ts` |
| Hook | `src/hooks/useLanTransfer.ts` |
| 恢复 Hook | `src/hooks/useRestore.ts` |
| 备份服务 | `src/services/BackupService.ts` |
| 恢复 Modal | `src/componentsV2/features/SettingsScreen/RestoreProgressModal.tsx` |
| 协议文档 | `docs/lan-transfer-protocol.md` |
| 测试参考 | `src/screens/settings/data/ZeroconfTest/ZeroconfTestScreen.tsx` |
| 类型定义 | `src/types/lanTransfer.ts` |

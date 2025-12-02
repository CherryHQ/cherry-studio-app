# Tailwind CSS 颜色配置详细统计报告

## 迁移映射表

### CSS 变量迁移

| 旧变量 | 新变量 | 旧 Tailwind 类 | 新 Tailwind 类 |
|--------|--------|----------------|----------------|
| `--color-background-primary` | `--color-background` | `bg-background-primary` | `bg-background` | ✅ 已完成 |
| `--color-background-secondary` | `--color-secondary` | `bg-background-secondary` | `bg-secondary` | ✅ 已完成 |
| `--color-ui-card` | `--color-card` | `bg-ui-card` | `bg-card` | ✅ 已完成 |
| `--color-ui-card-background` | `--color-card` | `bg-ui-card-background` | `bg-card` | ✅ 已完成 |
| `--color-text-primary` | `--color-foreground` | `text-text-primary` | `text-foreground` | ✅ 已完成 |
| `--color-text-secondary` | `--color-foreground-secondary` | `text-text-secondary` | `text-foreground-secondary` | ✅ 已完成 |
| `--color-text-delete` | `--color-error-base` | `text-text-delete` | `text-error-base` | ✅ 已完成 |
| `--color-text-link` | `--color-blue-500` | `text-text-link` | `text-blue-500` | ✅ 已完成 |
| `--color-normal` | `--color-foreground` | `text-normal` | `text-foreground` | ✅ 已完成 |
| `--color-normal` | `--color-foreground` | `border-normal` | `border-foreground` | ✅ 已完成 |

### 批量替换命令（✅ 全部已完成）

```bash
# 背景色
find src -name "*.tsx" -exec sed -i '' 's/bg-background-primary/bg-background/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/bg-background-secondary/bg-secondary/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/bg-ui-card-background/bg-card/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/bg-ui-card/bg-card/g' {} \;

# 文本色
find src -name "*.tsx" -exec sed -i '' 's/text-text-primary/text-foreground/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/text-text-secondary/text-foreground-secondary/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/text-text-delete/text-error-base/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/text-text-link/text-blue-500/g' {} \;
find src -name "*.tsx" -exec sed -i '' 's/text-normal/text-foreground/g' {} \;

# 边框色
find src -name "*.tsx" -exec sed -i '' 's/border-normal/border-foreground/g' {} \;
```

### 迁移注意事项

1. **ui-card 合并**: `bg-ui-card` 和 `bg-ui-card-background` 统一为 `bg-card`
2. **text-normal 合并**: `text-normal` 和 `text-text-primary` 统一为 `text-foreground`
3. **语义化命名**: 新变量遵循 shadcn/ui 命名规范，更加语义化

---

## 项目颜色系统概览

根据 `global.css` 中的定义，项目使用了以下颜色变量（支持 dark/light 两种主题）：

### CSS 变量定义 (global.css)

| 变量名 | Dark Mode | Light Mode |
|--------|-----------|------------|
| `--color-background-primary` | #121213 | #f7f7f7 |
| `--color-background-secondary` | #20202099 | #ffffff99 |
| `--color-background-opacity` | rgba(34, 34, 34, 0.7) | #ffffff |
| `--color-ui-card` | #19191c | #ffffff |
| `--color-ui-card-background` | #19191c | #ffffff |
| `--color-text-primary` | #f9f9f9 | #202020 |
| `--color-text-secondary` | #cecece | #646464 |
| `--color-text-delete` | #dc3e42 | #dc3e42 |
| `--color-text-link` | #0090ff | #0090ff |
| `--color-border-color` | rgba(255, 255, 255, 0.1) | rgba(0, 0, 0, 0.1) |
| `--color-normal` | #ffffff | #000000 |
| `--color-brand` | #00b96b | #00b96b |

---

## 详细颜色使用统计

### 1. bg-ui-card-background (23处使用)

**最常用的卡片背景色，用于所有卡片、下拉框、手风琴、弹窗容器**

| 文件路径 | 行号 | 元素类型 | 用途描述 |
|----------|------|----------|----------|
| `src/componentsV2/base/Skeleton/ListSkeleton.tsx` | 73, 103 | 容器/卡片 | MCP服务器和默认列表的骨架屏背景 |
| `src/componentsV2/base/Skeleton/GridSkeleton.tsx` | 18 | 网格项 | 助手卡片网格的骨架屏背景 |
| `src/screens/welcome/WelcomeScreen.tsx` | 64 | 容器 | 欢迎页按钮容器背景 |
| `src/componentsV2/features/ModelGroup/index.tsx` | 65, 77 | 手风琴容器 | 模型分组的触发器和内容背景 |
| `src/componentsV2/features/MCP/McpItemCard.tsx` | 31 | 卡片容器 | MCP服务器项卡片背景 |
| `src/componentsV2/features/SettingsScreen/RestoreProgressModal.tsx` | 82 | 弹窗/覆盖层 | 恢复进度弹窗背景 |
| `src/componentsV2/features/SettingsScreen/ThemeDropdown.tsx` | 36 | 按钮/下拉框 | 主题选择器按钮背景 |
| `src/componentsV2/features/SettingsScreen/LanguageDropdown.tsx` | 37 | 按钮/下拉框 | 语言选择器按钮背景 |
| `src/componentsV2/features/Assistant/AssistantItemCard.tsx` | 31 | 卡片容器 | 助手列表项卡片背景 |
| `src/componentsV2/features/Assistant/ToolUseDropdown.tsx` | 48 | 按钮/下拉框 | 工具使用模式选择器背景 |
| `src/componentsV2/features/Assistant/ModelTabContent.tsx` | 90 | 按钮 | 模型选择按钮背景 |
| `src/componentsV2/features/Assistant/McpServerDropdown.tsx` | 58, 69 | 按钮/下拉框 | MCP服务器选择器按钮背景（空状态和已选状态） |
| `src/componentsV2/features/Assistant/AssistantItemSkeleton.tsx` | 11 | 容器 | 助手项的骨架屏背景 |
| `src/componentsV2/features/Assistant/AssistantItem.tsx` | 111 | 容器 | 助手项行背景 |
| `src/componentsV2/features/Assistant/WebsearchDropdown.tsx` | 96, 107 | 按钮/下拉框 | 网络搜索提供商选择器背景 |
| `src/componentsV2/layout/Group/index.tsx` | 12 | 容器包装器 | 通用分组组件包装器（可复用容器） |
| `src/screens/home/messages/tools/MessageMcpTool.tsx` | 25, 34 | 手风琴容器 | MCP工具响应的触发器和内容背景 |
| `src/screens/settings/personal/PersonalScreen.tsx` | 51 | 卡片容器 | 个人设置卡片背景 |
| `src/screens/settings/assistant/AssistantSettingsScreen.tsx` | 27 | 按钮 | 助手设置模型按钮 |
| `src/hooks/useDialog.tsx` | 141 | 弹窗/覆盖层 | 对话框弹窗背景 |

### 2. bg-ui-card (2处使用)

**用于 ModelSheet 非多选模式下的按钮容器**

| 文件路径 | 行号 | 元素类型 | 用途描述 |
|----------|------|----------|----------|
| `src/componentsV2/features/Sheet/ModelSheet.tsx` | 215 | 按钮容器 | 多选切换按钮（默认状态） |
| `src/componentsV2/features/Sheet/ModelSheet.tsx` | 229 | 按钮容器 | 多选模式下的清除全部按钮 |

### 3. bg-background-primary (1处使用)

**主屏幕背景色，用于 SafeAreaContainer**

| 文件路径 | 行号 | 元素类型 | 用途描述 |
|----------|------|----------|----------|
| `src/componentsV2/layout/SafeAreaContainer/index.tsx` | 13 | 屏幕背景容器 | 所有页面的主背景包装器 |

### 4. bg-background-secondary (1处使用)

**半透明叠加效果背景**

| 文件路径 | 行号 | 元素类型 | 用途描述 |
|----------|------|----------|----------|
| `src/componentsV2/features/ChatScreen/MessageInput/index.tsx` | 40 | 输入框包装器 | 消息输入容器的半透明背景 |

### 5. bg-background-opacity (0处使用)

**未在代码中直接使用** - 可能由 HeroUI 或其他依赖内部使用

---

### 6. text-text-primary (78处使用)

**主要文本颜色，用于标题、主要标签、默认文本内容**

| 文件路径 | 行号 | 元素类型 | 用途描述 |
|----------|------|----------|----------|
| `src/componentsV2/base/Text/index.tsx` | 11 | 基础组件 | 所有 Text 组件的默认颜色 |
| `src/componentsV2/base/AvatarEditButton/index.tsx` | 58 | 头像文本 | 头像首字母 |
| `src/hooks/useDialog.tsx` | 144 | 对话框标题 | 对话框头部标题 |
| `src/screens/welcome/WelcomeScreen.tsx` | 67, 73 | 按钮文本 | 欢迎页按钮标签 |
| `src/componentsV2/features/ChatScreen/Header/AssistantSelection.tsx` | 32 | 助手名称 | 当前助手显示名称 |
| `src/componentsV2/features/ChatScreen/MessageInput/index.tsx` | 56 | 输入框文本 | 消息输入文字颜色 |
| `src/componentsV2/features/Sheet/ModelSheet.tsx` | 219, 233, 302 | 模型名称 | 模型名称和分组标题 |
| `src/componentsV2/features/Sheet/CitationSheet.tsx` | 39, 116 | 引用标题 | 引用标题和 Sheet 标题 |
| `src/componentsV2/features/Sheet/ToolSheet/SystemTools.tsx` | 29, 35, 41, 56 | 工具图标/标签 | 系统工具图标和选项文本 |
| `src/componentsV2/features/TopicItem/index.tsx` | 182, 190, 196 | 操作图标 | 多选/生成名称/编辑图标 |
| `src/componentsV2/features/TopicList/index.tsx` | 215 | 话题标题 | 列表项标题 |
| `src/componentsV2/features/Searching/index.tsx` | 26, 27 | 搜索图标/文本 | 搜索动画文本 |
| `src/componentsV2/features/MarqueeComponent/index.tsx` | 103, 115 | 跑马灯标题 | 头部文字和图标 |
| `src/componentsV2/features/Sheet/TextSelectionSheet.tsx` | 81 | Sheet 标题 | 文本选择 Sheet 头部 |
| `src/componentsV2/features/ModelTags/index.tsx` | 125 | 标签文本 | 模型标签标签 |
| `src/componentsV2/features/SettingsScreen/EmptyModelView.tsx` | 13 | 空状态标题 | 空模型视图大标题 |
| `src/componentsV2/features/SettingsScreen/AddModelSheet.tsx` | 108 | Sheet 标题 | 添加模型表单头部 |
| `src/componentsV2/features/SettingsScreen/ProviderItem.tsx` | 64 | 提供商名称 | 提供商列表项主标题 |
| `src/componentsV2/features/SettingsScreen/WebsearchProviderRow.tsx` | 32 | 提供商名称 | 网络搜索提供商名称 |
| `src/componentsV2/features/MCP/McpServerItemSheet.tsx` | 140, 147 | 章节标题 | 描述/工具章节标题 |
| `src/componentsV2/features/Menu/MenuTabContent.tsx` | 23 | 菜单标题 | 菜单章节标题 |
| `src/componentsV2/features/Assistant/AssistantItemCard.tsx` | 57 | 助手名称 | 卡片标题 |
| `src/componentsV2/features/Assistant/AssistantItemSheet.tsx` | 187, 202, 219, 227, 228 | 助手信息 | 助手名称/模型/描述/提示词标题 |
| `src/componentsV2/features/Assistant/AssistantItem.tsx` | 90 | 操作图标 | 多选复选框图标 |
| `src/screens/home/messages/blocks/ErrorBlock.tsx` | 523 | 错误标题 | 错误详情 Sheet 标题 |

### 7. text-text-secondary (72处使用)

**次要文本颜色，用于描述、元数据、辅助文字、表单标签、图标**

| 文件路径 | 行号 | 元素类型 | 用途描述 |
|----------|------|----------|----------|
| `src/componentsV2/base/SearchInput/index.tsx` | 22 | 搜索图标 | 搜索输入框图标 |
| `src/componentsV2/base/SelectionSheet/index.tsx` | 99, 136 | 副标题/占位符 | 选择项副标题和空状态消息 |
| `src/hooks/useDialog.tsx` | 149 | 对话框内容 | 对话框正文 |
| `src/componentsV2/features/ChatScreen/Header/AssistantSelection.tsx` | 35 | 指示图标 | 展开指示箭头 |
| `src/componentsV2/features/ChatScreen/MessageInput/PreviewItems/FileItem.tsx` | 43 | 文件大小 | 文件元数据 |
| `src/screens/home/messages/MessageFooter.tsx` | 73-110 | 操作图标/Token数 | 暂停/音频/复制/刷新/点赞/分享/更多图标和Token统计 |
| `src/screens/home/messages/MessageHeader.tsx` | 34, 35 | 提供商信息 | 提供商名称和详情 |
| `src/screens/settings/about/AboutScreen.tsx` | 61 | 描述文本 | 次要内容 |
| `src/componentsV2/features/Sheet/CitationSheet.tsx` | 48, 57 | 引用描述 | 描述文本和网站来源 |
| `src/componentsV2/features/TopicItem/index.tsx` | 236, 241 | 时间戳/预览 | 时间显示和话题预览 |
| `src/screens/settings/providers/AddProviderScreen.tsx` | 141, 157 | 表单标签 | 输入框标签 |
| `src/componentsV2/features/ModelGroup/index.tsx` | 55 | 空状态消息 | 无模型提示 |
| `src/screens/settings/providers/ProviderSettingsScreen.tsx` | 196 | 延迟显示 | 指标标签 |
| `src/componentsV2/features/MCP/McpItemCard.tsx` | 34 | MCP 描述 | 描述文本 |
| `src/componentsV2/features/MCP/McpServerItemSheet.tsx` | 141 | 描述内容 | 描述正文 |
| `src/screens/settings/assistant/AssistantSettingsScreen.tsx` | 52, 96, 104, 134, 142, 150 | 设置标签/图标 | 下拉指示器/章节标题/辅助文字/菜单图标 |
| `src/componentsV2/features/SettingsScreen/RestoreProgressModal.tsx` | 85 | 进度描述 | 状态消息 |
| `src/componentsV2/features/SettingsScreen/ThemeDropdown.tsx` | 37, 38, 41 | 下拉图标/标签 | 调色盘图标/标签文字/展开图标 |
| `src/componentsV2/features/SettingsScreen/AddModelSheet.tsx` | 132, 148, 163 | 表单标签 | 模型ID/名称/分组标签 |
| `src/componentsV2/features/SettingsScreen/LanguageDropdown.tsx` | 38, 41 | 下拉标签/图标 | 标签文字/展开图标 |
| `src/componentsV2/features/MarqueeComponent/index.tsx` | 130 | 提示文本 | 次要提示 |
| `src/componentsV2/features/Assistant/PromptTabContent.tsx` | 55, 66 | 表单标签 | 名称/提示词标签 |
| `src/componentsV2/features/Assistant/AssistantItemCard.tsx` | 61 | 助手描述 | 卡片描述 |
| `src/componentsV2/features/Menu/AssistantList.tsx` | 54, 67 | 副标题/空状态 | 助手描述和空状态消息 |
| `src/componentsV2/features/Assistant/ToolUseDropdown.tsx` | 52, 54, 56, 61, 65 | 下拉图标/标签 | 函数/扳手图标/标签/描述/展开图标 |
| `src/componentsV2/features/Assistant/AssistantItemSheet.tsx` | 220 | 描述内容 | 助手描述正文 |
| `src/componentsV2/features/Assistant/McpServerDropdown.tsx` | 59, 62, 71, 73, 77 | 下拉标签/图标 | 标签/箭头/数量/列表/展开图标 |
| `src/componentsV2/features/Assistant/WebsearchDropdown.tsx` | 97, 100, 111, 116, 120 | 下拉标签/图标 | 标签/箭头/提供商名/展开图标 |
| `src/componentsV2/features/Assistant/AssistantItem.tsx` | 130 | 助手描述 | 列表项描述 |
| `src/componentsV2/layout/Row/RowRightArrow.tsx` | 6 | 导航箭头 | 行右侧指示箭头 |

### 8. text-text-link (5处使用)

**链接文本颜色，用于可点击的链接和交互元素**

| 文件路径 | 行号 | 元素类型 | 用途描述 |
|----------|------|----------|----------|
| `src/componentsV2/base/ExternalLink/index.tsx` | 51 | 外部链接 | 外部链接文本样式 |
| `src/screens/settings/assistant/AssistantSettingsScreen.tsx` | 99 | 设置图标 | 设置操作图标 |
| `src/componentsV2/features/SettingsScreen/RestoreProgressModal.tsx` | 31 | 加载指示器 | 进行中状态 Spinner |
| `src/componentsV2/features/Menu/MenuTabContent.tsx` | 26 | 查看全部链接 | "See all" 链接文本 |

### 9. text-text-delete (1处使用)

**删除/停止操作文本颜色**

| 文件路径 | 行号 | 元素类型 | 用途描述 |
|----------|------|----------|----------|
| `src/componentsV2/features/ChatScreen/MessageInput/PauseButton.tsx` | 11 | 暂停图标 | 停止/取消操作指示器 |

### 10. text-normal (1处使用)

**默认图标颜色包装器**

| 文件路径 | 行号 | 元素类型 | 用途描述 |
|----------|------|----------|----------|
| `src/componentsV2/icons/LucideIcon/index.tsx` | 90 | 图标包装器 | Lucide 图标组件的默认颜色 |

---

### 11. border-normal (6处使用)

**边框颜色，使用 --color-normal 变量（Dark: #ffffff, Light: #000000）**

| 文件路径 | 行号 | 元素类型 | 用途描述 |
|----------|------|----------|----------|
| `src/componentsV2/features/Assistant/AssistantItem.tsx` | 114 | 复选框边框 | 多选模式下圆形复选框边框 |
| `src/componentsV2/features/TopicItem/index.tsx` | 220 | 复选框边框 | 多选模式下圆形复选框边框 |
| `src/componentsV2/features/Sheet/TextSelectionSheet.tsx` | 80 | 分隔线 | Sheet 头部底部边框分隔 (10% 透明度) |
| `src/componentsV2/features/Sheet/CitationSheet.tsx` | 115, 147 | 分隔线 | Sheet 头部和引用列表项之间的分隔 (10% 透明度) |
| `src/screens/home/messages/blocks/ErrorBlock.tsx` | 159 | 容器边框 | 错误详情值显示的细边框 (0.5px) |

### 12. border-border-color (0处使用)

**未在代码中直接使用** - CSS 变量 `--color-border-color` 已定义但未作为 Tailwind 类使用

### 13. border-color-border-linear (0处使用)

**未在代码中直接使用** - CSS 变量 `--color-color-border-linear` 已定义但未作为 Tailwind 类使用

---

### 14. 绿色系 (green-100/20/10) - 使用最广泛 (30+ 文件)

**主要用途**: 成功状态、已启用状态、选中状态、主要操作按钮

**常用组合模式**: `bg-green-10 border-green-20 text-green-100`

| 文件路径 | 颜色类组合 | 用途 |
|----------|-----------|------|
| `src/hooks/useDialog.tsx` | `bg-green-10 border-green-20 text-green-100` | 成功/默认对话框按钮 |
| `src/componentsV2/base/SelectionSheet/index.tsx` | `bg-green-10 border-green-20 text-green-100` | 选中项样式 |
| `src/componentsV2/base/AvatarEditButton/index.tsx` | `border-green-100` | 头像边框 |
| `src/componentsV2/features/Assistant/AssistantItemSheet.tsx` | `bg-green-10 border-green-20 text-green-100` | 标签/使用按钮 |
| `src/componentsV2/features/Assistant/AssistantItemCard.tsx` | `bg-green-10 border-green-20 text-green-100` | 模型标签徽章 |
| `src/componentsV2/features/Assistant/ModelTabContent.tsx` | `bg-green-10 border-green-20 text-green-100` | 模型标签样式 |
| `src/componentsV2/features/SettingsScreen/ProviderItem.tsx` | `bg-green-10 border-green-20 text-green-100` | 已启用状态徽章 |
| `src/componentsV2/features/SettingsScreen/WebsearchProviderRow.tsx` | `bg-green-10 border-green-20 text-green-100` | 提供商状态徽章 |
| `src/componentsV2/features/SettingsScreen/AddModelSheet.tsx` | `bg-green-10 border-green-20 text-green-100` | 添加模型按钮 |
| `src/componentsV2/features/SettingsScreen/RestoreProgressModal.tsx` | `bg-green-20 border-green-20 text-green-100` | 成功状态指示器 |
| `src/componentsV2/features/SettingsScreen/ProviderIconButton.tsx` | `border-green-100` | 头像边框 |
| `src/componentsV2/features/ChatScreen/MessageInput/ToolPreview.tsx` | `bg-green-10 border-green-20 text-green-100` | 工具预览徽章 |
| `src/componentsV2/features/ChatScreen/MessageInput/MentionButton.tsx` | `bg-green-10 border-green-20 text-green-100` | 提及按钮 |
| `src/componentsV2/features/ChatScreen/MessageInput/McpButton.tsx` | `bg-green-10 border-green-20 text-green-100` | MCP 按钮 |
| `src/componentsV2/features/ChatScreen/MessageInput/PreviewItems/BaseItem.tsx` | `bg-green-20 text-green-100` | 移除按钮样式 |
| `src/componentsV2/features/TopicItem/index.tsx` | `bg-green-10` | 活跃话题背景 |
| `src/componentsV2/features/MCP/McpItemCard.tsx` | `bg-green-10 border-green-20 text-green-100` | MCP 能力徽章 |
| `src/componentsV2/features/ModelGroup/index.tsx` | `bg-green-20 text-green-100` | 模型数量标签 |
| `src/componentsV2/features/Sheet/ModelSheet.tsx` | `bg-green-10 border-green-20 text-green-100` | 模型选择样式 |
| `src/componentsV2/features/Sheet/CitationSheet.tsx` | `bg-green-10 border-green-20 text-green-100` | 引用编号徽章 |
| `src/componentsV2/features/Sheet/ToolSheet/ExternalTools.tsx` | `text-green-100` | 活跃工具勾选 |
| `src/navigators/AssistantDetailTabNavigator.tsx` | `bg-green-20 text-green-100` | 活跃标签指示器 |
| `src/hooks/useToast.tsx` | `text-green-100` | 默认 Toast 文本颜色 |
| `src/screens/home/messages/MultiModelTab.tsx` | `text-green-100` | 活跃标签文本 |
| `src/screens/home/messages/CitationList.tsx` | `bg-green-10 border-green-20 text-green-100` | 引用徽章 |
| `src/screens/home/messages/MessageContent.tsx` | `bg-green-10 border-green-20` | 消息内容框 |
| `src/screens/settings/about/AboutScreen.tsx` | `bg-green-10 border-green-20 text-green-100` | 版本/功能徽章 |
| `src/screens/settings/providers/AddProviderScreen.tsx` | `bg-green-10 border-green-20 text-green-100` | 添加提供商表单 |
| `src/screens/settings/providers/ApiServiceScreen.tsx` | `text-green-100` | 成功图标 |
| `src/screens/settings/providers/ManageModelsScreen.tsx` | `bg-green-10 border-green-20 text-green-100` | 添加模型按钮/标签 |
| `src/screens/settings/providers/ProviderSettingsScreen.tsx` | `bg-green-10 border-green-20 text-green-100` | 模型项样式/成功指示器 |

### 15. 红色系 (red-100/20/10) - 7 文件

**主要用途**: 错误状态、删除操作、警告

**常用组合模式**: `bg-red-10 border-red-20 text-red-100`

| 文件路径 | 颜色类 | 用途 |
|----------|--------|------|
| `src/hooks/useDialog.tsx` | `bg-red-20 text-red-100` | 错误对话框按钮 |
| `src/componentsV2/features/SettingsScreen/RestoreProgressModal.tsx` | `bg-red-20 border-red-20 text-red-100` | 错误状态指示器按钮 |
| `src/componentsV2/features/Assistant/AssistantItem.tsx` | `text-red-100` | 删除图标 |
| `src/screens/home/messages/tools/MessageMcpTool.tsx` | `text-red-100` | 错误图标指示器 |
| `src/screens/home/messages/blocks/ErrorBlock.tsx` | `bg-red-10 border-red-20 text-red-100` | 错误消息块和堆栈跟踪样式 |
| `src/screens/settings/providers/ProviderSettingsScreen.tsx` | `bg-red-20 text-red-100` | 移除模型按钮/错误消息 |
| `src/screens/settings/providers/ManageModelsScreen.tsx` | `bg-red-20 text-red-100` | 移除模型按钮 |

### 16. 橙色系 (orange-100/20/10) - 5 文件

**主要用途**: 警告提示、Function Calling 功能标识、待处理状态

**常用组合模式**: `bg-orange-10 text-orange-100` 或 `bg-orange-20 border-orange-20 text-orange-100`

| 文件路径 | 颜色类 | 用途 |
|----------|--------|------|
| `src/componentsV2/features/ModelTags/index.tsx` | `bg-orange-20 text-orange-100` | Function Calling 标签（wrench 图标） |
| `src/componentsV2/features/Sheet/McpServerSheet.tsx` | `bg-orange-10 text-orange-100` | 空工具使用状态警告提示框 |
| `src/hooks/useDialog.tsx` | `bg-orange-20 border-orange-20 text-orange-100` | 警告类型对话框按钮 |
| `src/componentsV2/features/SettingsScreen/RestoreProgressModal.tsx` | `text-orange-100` | 待处理状态图标 |

### 17. 蓝色系 (blue-100/20/10) - 5 文件

**主要用途**: 信息提示、Web Search 功能标识

**常用组合模式**: `bg-blue-20 border-blue-20 text-blue-100`

| 文件路径 | 颜色类 | 用途 |
|----------|--------|------|
| `src/componentsV2/features/ModelTags/index.tsx` | `bg-blue-20 text-blue-100` | Web Search 标签（globe 图标） |
| `src/hooks/useDialog.tsx` | `bg-blue-20 border-blue-20 text-blue-100` | 信息类型对话框按钮 |
| `src/screens/settings/personal/PersonalScreen.tsx` | `bg-blue-100` | 头像编辑按钮（相机图标背景） |

### 18. 紫色系 (purple-100/20) - 2 文件

**主要用途**: Reasoning、Embedding 模型能力标识

| 文件路径 | 颜色类 | 用途 |
|----------|--------|------|
| `src/componentsV2/features/ModelTags/index.tsx` | `bg-purple-20 text-purple-100` | Reasoning 标签（lightbulb 图标） |
| `src/componentsV2/features/ModelTags/index.tsx` | `bg-purple-20 text-purple-100` | Embedding 标签（languages 图标） |

### 19. 粉色系 (pink-100/20) - 1 文件

**主要用途**: Rerank 模型能力标识

| 文件路径 | 颜色类 | 用途 |
|----------|--------|------|
| `src/componentsV2/features/ModelTags/index.tsx` | `bg-pink-20 text-pink-100` | Rerank 标签（repeat2 图标） |

### 20. 黄色系 (yellow-100/20) - 2 文件

**主要用途**: 免费模型标识、运行中状态

| 文件路径 | 颜色类 | 用途 |
|----------|--------|------|
| `src/componentsV2/features/ModelTags/index.tsx` | `bg-yellow-20 text-yellow-100` | 免费模型标签 |
| `src/componentsV2/features/SettingsScreen/RestoreProgressModal.tsx` | `bg-yellow-20 border-yellow-20 text-yellow-100` | 运行中状态按钮 |

### 21. 灰度色 (gray-80/60/40/20/10) - 14+ 文件

**主要用途**: 次要文本、禁用状态、分隔线、占位符、交互状态

| 文件路径 | 颜色类 | 用途 |
|----------|--------|------|
| `src/componentsV2/features/ChatScreen/Header/AssistantSelection.tsx` | `text-gray-60` | 副标题文本 |
| `src/componentsV2/features/ChatScreen/MessageInput/PreviewItems/ImageItem.tsx` | `text-gray-20` | 图片不可用图标 |
| `src/componentsV2/features/ChatScreen/MessageInput/PreviewItems/FileItem.tsx` | `bg-gray-20` | 文件项容器背景 |
| `src/hooks/useDialog.tsx` | `border-gray-20 text-gray-80` | 取消按钮样式 |
| `src/componentsV2/features/Sheet/ModelSheet.tsx` | `text-gray-400 text-gray-80` | 章节头部和图标 |
| `src/screens/welcome/ImportDataSheet.tsx` | `bg-gray-10` | 分组背景 |
| `src/screens/home/markdown/items/MarkdownImage.tsx` | `text-gray-20` | 图片占位符图标 |
| `src/screens/settings/websearch/WebSearchProviderSettingsScreen.tsx` | `text-gray-400` | 空状态消息 |
| `src/screens/settings/providers/ApiServiceScreen.tsx` | `text-gray-400` | 空状态消息 |
| `src/componentsV2/features/Assistant/AssistantsTabContent.tsx` | `text-gray-60` | 空状态消息 |
| `src/componentsV2/features/Assistant/AssistantItemCard.tsx` | `active:bg-gray-20` | 卡片按压/活跃状态 |
| `src/componentsV2/features/Sheet/McpServerSheet.tsx` | `bg-gray-10` | 输入容器背景 |
| `src/screens/home/messages/blocks/TranslationBlock.tsx` | `bg-gray-40` | 分隔线样式 |
| `src/componentsV2/features/Sheet/ToolSheet/SystemTools.tsx` | `bg-gray-20` | 工具项背景 |

---

## 设计模式总结

### 状态徽章模式（Button/Badge）
```
成功/启用/默认: bg-green-10 border-green-20 text-green-100
错误/删除:      bg-red-10 border-red-20 text-red-100
警告/待处理:    bg-orange-10 border-orange-20 text-orange-100
信息:           bg-blue-10 border-blue-20 text-blue-100
运行中:         bg-yellow-20 border-yellow-20 text-yellow-100
```

### 模型能力标签模式（ModelTags）
```
Reasoning:        bg-purple-20 text-purple-100 (lightbulb icon)
Embedding:        bg-purple-20 text-purple-100 (languages icon)
Web Search:       bg-blue-20 text-blue-100 (globe icon)
Function Calling: bg-orange-20 text-orange-100 (wrench icon)
Rerank:           bg-pink-20 text-pink-100 (repeat2 icon)
Free:             bg-yellow-20 text-yellow-100
```

### 背景色层级模式
```
屏幕级背景: bg-background-primary (SafeAreaContainer)
卡片级背景: bg-ui-card-background (所有卡片、下拉框、弹窗)
输入区背景: bg-background-secondary (半透明叠加)
```

### 文本层级模式
```
主要文本:   text-text-primary (标题、主内容)
次要文本:   text-text-secondary (描述、元数据、图标)
链接文本:   text-text-link (可点击链接)
删除/停止:  text-text-delete (危险操作)
默认图标:   text-normal (Lucide 图标包装器)
```

### 边框模式
```
选择/复选框: border-normal (多选复选框)
分隔线:      border-normal/10 (Sheet 头部分隔)
状态徽章:    border-{color}-20 (配合背景使用)
```

---

## 颜色使用分布统计

| 颜色类别 | 使用次数 | 文件数量 | 主要用途 |
|----------|---------|---------|---------|
| text-text-primary | 78 | 25+ | 标题、主要文本 |
| text-text-secondary | 72 | 30+ | 描述、元数据、图标 |
| green 系列 | 60+ | 30+ | 成功/选中/启用状态 |
| bg-ui-card-background | 23 | 20 | 卡片/容器背景 |
| gray 系列 | 20+ | 14+ | 中性元素、交互状态 |
| red 系列 | 10+ | 7 | 错误/删除操作 |
| orange 系列 | 10 | 5 | 警告/Function Calling |
| border-normal | 6 | 5 | 复选框/分隔线边框 |
| blue 系列 | 5 | 5 | 信息/Web Search |
| text-text-link | 5 | 4 | 链接文本 |
| purple 系列 | 6 | 2 | Reasoning/Embedding |
| bg-ui-card | 2 | 1 | ModelSheet 按钮 |
| yellow 系列 | 4 | 2 | 免费模型/运行状态 |
| pink 系列 | 3 | 1 | Rerank |
| bg-background-primary | 1 | 1 | 屏幕背景 |
| bg-background-secondary | 1 | 1 | 输入区背景 |
| text-text-delete | 1 | 1 | 停止按钮 |
| text-normal | 1 | 1 | 图标包装器 |

### 未使用的 CSS 变量
- `--color-background-opacity` - 已定义但未使用
- `--color-border-color` - 已定义但未作为 Tailwind 类使用
- `--color-color-border-linear` - 已定义但未作为 Tailwind 类使用
- `--color-brand` - 已定义但未直接使用（可能用于 HeroUI）

---

## 关键发现

1. **背景色使用集中**: `bg-ui-card-background` 是最常用的背景类（23处），而 `bg-background-primary` 仅在 SafeAreaContainer 使用一次
2. **文本色使用规范**: `text-text-primary` 和 `text-text-secondary` 形成清晰的文本层级
3. **绿色系最活跃**: 绿色系颜色在 30+ 文件中使用，是最广泛使用的语义色
4. **模型能力标签集中**: 所有模型能力标签颜色都集中在 `ModelTags/index.tsx`
5. **对话框样式统一**: `useDialog.tsx` 定义了所有对话框类型的按钮颜色
6. **部分变量未使用**: 3个 CSS 变量已定义但未被 Tailwind 类引用

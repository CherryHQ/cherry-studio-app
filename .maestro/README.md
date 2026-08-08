# E2E 测试规范（Maestro）

本目录由 agent-device 真机/模拟器排查沉淀而来（2026-07-18），flows 中的每个断言 label 均来自实测 accessibility snapshot，非猜测。

## 目录结构

```
.maestro/
  README.md            # 本文件：规范与运行说明
  subflows/            # 可复用步骤（不作为独立测试运行）
    launch.yaml        # 启动 app + 等主屏（launcher 时 deep link 兜底连 Metro）
  flows/               # 测试流（maestro test 的目标目录）
    00-smoke-boot.yaml
    01-topic-list.yaml
    02-settings-navigation.yaml
    03-provider-detail.yaml
    04-provider-model-add.yaml
    05-provider-model-pull.yaml
    06-websearch-api-keys.yaml
    07-chat-input-menu.yaml
```

## 运行方式

```bash
# 前置：模拟器已装 dev-client 构建，Metro 已启动
npx expo start --dev-client --port 8081

# 语法检查（CI 可跑，无需模拟器）
pnpm e2e:maestro:check

# 全量运行
pnpm e2e:ios

# 单流运行
pnpm e2e:ios:flow .maestro/flows/00-smoke-boot.yaml
```

## 环境前提

1. **dev-client 构建**已安装到模拟器（appId `com.cherry-ai.cherry-studio-app`）。
2. **Metro 运行中**（8081）。dev-client 冷启动会自动重连上次使用的 Metro；
   仅当停在 launcher 时，`subflows/launch.yaml` 才用 deep link
   `cherrystudio://expo-development-client/?url=…` 兜底强连。
3. **种子数据**：dev 环境 SeedRunner 会注入 Benchmark 话题；Provider flows 使用
   preset `CherryIN`。它没有测试 API key，因此 pull flow 验证错误/空结果反馈，
   pull/reconcile 成功路径由 application contract tests 覆盖。生产构建无 Benchmark
   数据，flows 仅面向 dev/preview 构建。

## 已知环境陷阱（排查实证）

- **expo-dev-menu 悬浮 FAB 会吞点击**：dev-client 的 gearshape 悬浮球默认停在
  右上区域 (~86%, 23%)，恰好覆盖 provider/websearch 详情页右侧按钮列
  （实测 "API Key settings"/"Check" 按钮点击被吞、无任何报错）。
  `pnpm e2e:ios` 的 prepare 步骤通过 UserDefaults 关闭它
  （`EXDevMenuShowFloatingActionButton -bool NO`，写一次持久生效）。
  release/preview 构建无此问题。
- **openLink 不能紧跟 launchApp**：`simctl openurl` 落在 dev-client 冷启动
  窗口期会让 app 留在后台（前台停在桌面），后续断言必挂且无报错。
  实测冷启动本身就会自动重连 Metro，所以 launch 子流正常路径只
  `launchApp` + 等主屏，deep link 仅在停在 launcher 时兜底（此时 app
  必已在前台，无竞态）。
- **`back` 是 Android-only**：iOS 上 `- back` 静默 no-op（命令显示 COMPLETED
  但页面不动），后续断言全部错位失败。iOS 返回必须 `tapOn: "Back"`
  （BackHeader 的 accessibilityLabel，i18n key `navigation.back`）。
- **照片权限**：全新模拟器首次打开照片网格会弹系统权限框，相关 flow 内
  以 `optional: true` 步骤兜底点击。
- **iOS 26 模拟器**上 dev-client 首次 bundle 需 ~3s，launch 子流已含等待。
- **连续快速重启偶发白屏卡死**：套件逐 flow 重启 app，dev-client 偶发
  停在纯白首屏（Metro 侧无任何报错，重跑即过）。launch 子流已用
  `retry`（maxRetries 2）包裹整段启动自愈；若仍失败，单独重跑该 flow。

## 断言与数据卫生规范

- 文案 selector 同时覆盖英文和简体中文；测试数据名称与技术字段使用稳定原文。
- flows **不留脏数据**：Add model 不 Save，WebSearch 测试 key 用后立即通过 Remove
  清理（见 06 尾部），未配置密钥的 model pull 不会写模型。
- 每个 flow 自身可独立运行（都以 `runFlow: ../subflows/launch.yaml` 开头，
  并从主页出发导航）。
- 新增 flow 时：先用 agent-device snapshot 实测 label，再写断言；
  变更 UI 文案时同步更新对应 flow。

## 覆盖矩阵（与实测结论对应）

| Flow | 覆盖面 | 排查结论 |
| --- | --- | --- |
| 00 | 冷启动、消息 tab、新会话、无默认模型时的 model picker | ✅ 正常 |
| 01 | 话题列表、100 条复杂消息渲染+滚动（LegendList） | ✅ 正常，初始定位底部 |
| 02 | Settings 各屏可达性 | ✅ 正常 |
| 03 | Provider 配置/模型 tabs、空模型页、Pull/Add 入口 | ✅ 正常 |
| 04 | Add model 表单、Save 使能 | ✅ 正常 |
| 05 | 未配置 API key 时的 Pull 错误/空结果反馈 | ✅ 正常，无写入 |
| 06 | WebSearch key 输入/commit、per-key 设置、删除 | ✅ 单行显示（历史"两行"问题未复现） |
| 07 | Add to Chat sheet、照片网格选择/取消（Gesture.Tap） | ✅ 正常，a11y 保留 |

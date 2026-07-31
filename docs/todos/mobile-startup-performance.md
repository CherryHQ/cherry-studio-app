# Mobile Startup Performance TODOs

Status: active

本文记录移动端冷启动路径的性能测量与优化待办。当前启动链路已在第二部分完成结构调整（原生 splash 覆盖整个初始化、reconcile 移出 gate），但**尚未有真机耗时数据**，无法判断新用户首启是否存在需要优化的开屏耗时。

相关文档：`docs/architecture/mobile-runtime-ownership.md`、`docs/adr/0002-*`（启动 gate 契约）。

## STARTUP-TODO-001: 测量新用户首启开屏耗时

当前状态：`_layout.tsx` 顶层 `SplashScreen.preventAutoHideAsync()` 把原生 splash 钉住，
`AppBootstrapProvider` 在 `AppBootstrapRuntime.initialize()` 结算后命令式调用 `hideAsync()`。
因此**开屏时长 = 原生 splash 显示到 `hideAsync()` 之间的墙钟时间**，等于 gate 内关键路径耗时。
目前没有任何真机/模拟器实测数据，也没有埋点。

需要重点区分两种场景，二者成本差异很大：

- **新用户首启（空库）**：`migrate` 应用全部迁移、FTS5 建虚表、**所有 seeder 真正执行**——尤其 `PresetProviderSeeder` 会全量写入预置 provider 目录，`DefaultAssistantSeeder` 写默认助手 + 空 Topic + root Message。这是开屏耗时的最坏情况。
- **稳态冷启动**：seeder 与 FTS custom DDL 各自命中 `app_state` 里的 journal 版本直接 skip，只剩开库 + 迁移检查 + 读三次表（偏好、seed journal、custom-sql journal）。

完成条件：

- 在 gate 内关键路径打点，至少覆盖 `DbService.init()`（细分 `configurePragmas` / `migrate` / `runCustomMigrations` / `seedDatabase`）、`preference.init()`、`initializeAppRuntime`（含 `initI18n`）四段，并记录 `preventAutoHideAsync` 到 `hideAsync` 的总窗口。
- 分别采集**新用户首启（fresh install，先 uninstall 清数据容器）**与**稳态冷启动**两组数据，各在真机上重复多次取中位数/尾部（p50/p95），机型至少覆盖一台低端 Android + 一台旧 iPhone。
- 给出每段耗时占比，定位主要成本来源（预期在 `migrate` 首次执行 + `PresetProviderSeeder` 全量写入）。
- 若首启开屏超出可接受阈值，再评估第二部分**明确不做**清单中仍未做的优化项是否需要重启：`PresetProviderSeeder` 全量目录写入延后到 post-ready。阈值与优化取舍待本 TODO 有数据后再定。
  - 注：原列于此清单的「FTS `runCustomMigrations` 版本 guard」已在一致性 review 后续修复中落地（`DbService.runCustomMigrations` 以 `app_state` key `custom-sql:message-fts` 记录内容哈希，DDL 未变则整段跳过），不再属于待评估项——它消除的是每次冷启动对 `sqlite_master` 的无条件 DROP/CREATE 写入，收益不依赖测量数据。

依赖：需要可运行的 release/production build 才能反映真实首启耗时（dev build 含 `MockChatSeeder` 且未开启 Hermes 字节码优化，数据仅供参考）。

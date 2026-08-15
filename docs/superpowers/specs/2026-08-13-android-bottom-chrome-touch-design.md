# Android 底部操作区原位触摸修复设计

## 背景

Android 原生底部 tab bar 隐藏后，Provider 详情、拉取模型、MCP、消息选择、助手选择和助手详情等页面的底部操作仍能绘制到屏幕底部，但落在原 tab bar 高度内的部分无法点击。

这不是系统安全区直接屏蔽触摸：设备上的失效按钮大部分位于系统强制手势区域上方，系统输入日志也显示事件已进入应用窗口。相同按钮临时上移后能够点击，说明业务按钮和回调本身正常；`pointerEvents`、z-index、elevation、Responder、绝对/普通布局等对照实验均未改变结果。

## 根因

`react-native-bottom-tabs` 1.4.0 的 Android `ReactBottomNavigationView` 由两部分组成：

- `layoutHolder` 承载各个 React tab 场景；
- `bottomNavigation` 承载原生 Material 底栏。

显示底栏时，`layoutHolder` 的高度会扣除底栏高度。隐藏底栏时，上游 `setTabBarHidden` 只把 `bottomNavigation.visibility` 切换为 `GONE`，形成两个连续缺陷：

1. holder、选中场景及 JS scene wrapper 的有效尺寸没有作为同一次布局变更完成同步；
2. `ExtendedBottomNavigationView` 虽然已经 `GONE`，仍保留隐藏前的 bounds 和五个 Material tab item 子节点。

单独调用 `requestLayout()` 不足以修复第一个缺陷：即使 holder 扩展，`TabView.tsx` 保存的 `measuredDimensions` 仍可能是隐藏前尺寸。现有原生 `onNativeLayout` 又只以整个 `ReactBottomNavigationView` 的宽高作为去重条件；隐藏底栏不会改变这个根视图尺寸，因此 holder 的有效高度变化不会稳定上报给 JS。

设备探针进一步证明，holder、选中 container 和首个 React child 扩展到 `(0,0)-(1080,2400)` 后，原坐标点击仍会失败。React Native `TouchTargetHelper` 按子节点逆序寻找目标，并读取 `ReactPointerEventsView`，但不以 Android `visibility` 排除普通原生 View。位于 holder 之后的隐藏 `ExtendedBottomNavigationView` 因而先于业务 scene 被遍历；点击 `(124,2282)` 时实际命中其旧“主页”tab item，而不是 bounds 为 `(32,2221)-(216,2342)` 的“全选”按钮。事件最终收敛到 `ReactBottomNavigationView`，不会进入业务 JS responder。这是白色空白区内按钮不可点击的决定性阻断点。

上游 1.4.0 与当前主干仍采用上述布局和隐藏逻辑：

- <https://github.com/callstack/react-native-bottom-tabs/blob/main/packages/react-native-bottom-tabs/android/src/main/java/com/rcttabview/RCTTabView.kt>
- <https://github.com/callstack/react-native-bottom-tabs/blob/main/packages/react-native-bottom-tabs/src/TabView.tsx>

## 产品验收条件

- 底部按钮、操作栏和白色留白的屏幕坐标保持不变。
- 控件尺寸、内部 safe-area padding 和现有动画保持不变。
- 不以 tab bar 高度上移任何业务控件。
- 原位置的整个应用按钮区域可以点击；系统导航手势仍由 Android 处理。
- 显示/隐藏底栏、冷启动、深链/状态恢复和 tab 切换后均不出现空白页或首帧跳动。
- iOS 行为不变。

## 方案

### 依赖补丁边界

通过 pnpm `patchedDependencies` 为 `react-native-bottom-tabs@1.4.0` 添加最小 Android 补丁。该补丁只修正 native tab 容器自身的布局契约，不引入 Cherry Studio 业务概念。

这属于共享基础设施修改，但满足独立价值要求：任何绘制到隐藏底栏区域的 tab 后代都会受当前缺陷影响，即使移除本次发现的五个操作组件，场景的可视范围与命中范围不一致仍是导航容器缺陷。正确修复无法只在单个消费者层完成。

### 原生布局与命中同步

`ReactBottomNavigationView` 需要以 `layoutHolder` 的实际尺寸作为 scene layout 的事实来源：

1. `setTabBarHidden` 仅在可见性确实变化时切换底栏状态并请求重新布局。
2. 在 Android 完成布局、`layoutHolder` 得到最终宽高后，再上报 scene layout；不预测尺寸，也不在属性 setter 中抢跑。
3. scene layout 的去重键使用 `layoutHolder.width` 和 `layoutHolder.height`，而不是不变的根视图宽高。
4. `TabView.tsx` 收到新尺寸后更新 `measuredDimensions`，使选中场景的原生布局边界与 holder 一致。
5. `ExtendedBottomNavigationView` 实现 `ReactPointerEventsView`：可见时返回 `PointerEvents.AUTO`，隐藏时返回 `PointerEvents.NONE`，让 React Native 命中遍历跳过整条隐藏底栏分支。
6. 底栏重新显示时走同一条路径，把 scene 恢复到扣除底栏后的高度，并恢复底栏的标准触摸行为。

布局回调必须忽略零尺寸和重复尺寸，避免冷启动未测量状态覆盖可用布局，也避免无意义的 JS 更新。补丁不转发或伪造触摸事件，不修改业务坐标；触摸仍走 Android 和 React Native 的标准命中、分发流程。

### 应用层回退

撤销当前提交中所有依赖“保留底栏高度并上移控件”的行为，包括：

- `BottomTabBarHeightObserver` 和保留高度 Context；
- Android 首次测量后才隐藏底栏的 gating；
- 四个悬浮操作栏的 tab-bar `bottom` 偏移；
- 助手详情按钮增加的 tab-bar padding。

现有 `BottomTabBarVisibilityProvider` 只继续负责显示/隐藏意图。各业务组件恢复原来的定位和 safe-area 处理，因此视觉结果与修复前一致。

## 同类消费者范围

设备回归覆盖以下五个实现、六个用户场景：

1. `ProviderDetailChrome.android.tsx`
2. `ProviderModelPullChrome.android.tsx`
3. `McpServerChrome.android.tsx`
4. `SelectionToolbar.android.tsx`（消息和助手列表共用）
5. `AssistantDetailScreen.tsx`（“开始聊天”）

`PaintingViewerChrome.android.tsx` 位于 tab navigator 外，不依赖本次容器修复。

## 备选方案及不足

### 业务控件上移

能够绕过旧命中边界，但改变底部操作区位置和留白，不符合产品验收条件；同时把导航容器缺陷泄漏给每个消费者。撤销该方案。

### 根级覆盖层

把五类操作 UI 传送到 tab 容器之外可以保留视觉坐标和触摸，但会让页面状态、回调、动画、无障碍顺序和卸载所有权跨越导航边界，并引入新的共享 UI 通道。它只绕过缺陷，且消费者改造面大于原生契约修复。

### 重组路由或替换原生 tabs

把嵌套页迁到 root Stack 不能解决消息/助手 tab 首页的选择工具栏；替换为 JS tab bar 则影响全部 tab 的外观、生命周期、返回和平台行为。两者都明显超出本次缺陷范围。

### 扩大业务 `hitSlop` 或修改业务 `pointerEvents`

Android 不会把子视图的 hitSlop 扩展到父原生命中边界之外，设备实验也已证明修改业务操作栏的 `pointerEvents`、Responder 和层级无效。最终补丁设置的是造成遮挡的原生 Material 底栏自身的 RN 命中语义，边界与业务 workaround 不同。

## 测试与验证

### 自动化保护

- 添加上游补丁守卫测试，确认安装后的 `react-native-bottom-tabs` 包含 holder 尺寸去重、布局完成后上报逻辑，以及隐藏底栏的 `PointerEvents.NONE` 契约，防止依赖升级或补丁漂移静默丢失。
- 保留并调整 tab 可见性纯函数测试，只覆盖应用仍拥有的显示/隐藏行为；删除仅为上移方案服务、已无保护价值的高度保留测试。
- 运行目标 Jest、应用类型检查、定向 lint/格式检查和 Android debug 编译。

### Android 设备回归

- 先记录修复前每个操作控件的 bounds，再确认修复后 bounds 完全一致。
- 在原失效坐标约 y=2277 点击消息选择和助手选择操作，状态必须变化。
- 在原位置点击 Provider 拉取、Provider 详情、MCP 操作和助手详情“开始聊天”。
- 显示底栏后验证五个 tab 均可点击，内容高度正常。
- 验证隐藏到显示、显示到隐藏、tab 切换、返回、冷启动以及直接进入嵌套页。
- 通过原生层级/布局信息确认 holder、选中容器和 scene wrapper 的底边一致，而不是依赖视觉推断。

### 最终设备证据

在 `Cherry_API_36`（1080×2400）上使用包含补丁的全量 arm64 debug APK 验证：

- 消息选择栏保持 `(32,2221)-(1049,2342)`，“全选”保持 `(32,2221)-(216,2342)`；点击原中心 `(124,2282)` 后由“全选/删除禁用”变为“已选择 18 项/删除启用”。
- 助手选择栏保持 `(32,2222)-(1049,2343)`；点击 `(124,2283)` 后由“全选/删除禁用”变为“已选择 7 项/删除启用”。
- Provider 拉取模型页在 y=2216–2337 的原区域完成取消全选/全选切换；Provider 详情的“拉取”在 `(161,2209)-(287,2335)` 原区域进入模型选择页，未应用或停用配置。
- 助手详情“开始聊天”保持 `(42,2222)-(1038,2337)`；点击 `(540,2280)` 后进入新聊天页。
- MCP 无已有实例，按约束未创建数据；由同一 native 容器修复、补丁守卫和相邻业务测试覆盖。
- 返回根页后五个原生 tab 均可点击；显示→隐藏、隐藏→显示和进程 relaunch 均无持久白页或 `RCTTabView` 崩溃。
- 安装包从设备 pull 回后的 SHA256 与构建产物一致，Dex 包含 `ExtendedBottomNavigationView.getPointerEvents()`，确认验收 APK 使用了当前补丁。

## 风险控制

- 补丁限定 Android；iOS 源码和 JS 公共 API 不变。
- 不新增触摸转发或坐标转换，降低多指、手势和无障碍风险；可见底栏保持 `PointerEvents.AUTO`。
- 不写死 tab bar 高度或机型尺寸。
- 如布局完成后的尺寸同步仍不能让三个边界一致，则停止扩大补丁，重新评估根级覆盖层方案，不以额外业务偏移掩盖问题。

# 设计规范

这份文档管**视觉决策**：颜色从哪来、层次怎么建、什么时候可以加一条边框、什么时候不许写字面值。它不管交互组件的归属（见 [UI Components](docs/references/ui-components.md)）、导航与安全区（见 [Navigation And Insets](docs/references/navigation-and-insets.md)）、命名（见 [Naming Conventions](docs/references/naming-conventions.md)）。

视觉语言采自 Vercel Brand Guidelines（Geist）。但 VBG 那份规范是给 web 报告站写的 —— 12 栏栅格、`.vbg-*` 类、图表即证据、报告外壳，这些在 React Native 里不存在，一条都没迁。迁进来的是它的**判断力**：先排版后表面、单色优先、颜色必须带信息、克制不等于寡淡。下面每条规则都对应本仓库真实存在的东西，不是转述。

---

## 冲突时的优先级

需求打架时，按这个顺序保：

1. **可读性与无障碍**。对比度不达标就是 bug，不是风格偏好。
2. **契约完整性**。不绕过 token 层，不写字面色。
3. **两个主题等价**。浅色能读的，深色也要能读；反之亦然。
4. **层次正确**。一屏之内有一个主对象，读者的眼睛知道先看哪。
5. **与既有模式一致**。同类交互长得一样。
6. **细节打磨**。动效、间距微调、平台差异。

排在前面的不能为后面让路。「这样更好看但对比度掉到 3:1」——不行。

---

## 颜色

### 唯一来源是契约

`packages/design-tokens/` 是所有颜色的唯一出口。组件永远不写颜色字面值。

```
tokens/colors/vercel.css   VBG 调色板（background / gray / gray-alpha / blue / green / amber / red）
        ↓
shadcn.css                 32 个 shadcn 角色名
product.css                38 个 Cherry 产品语义
        ↓
native.css                 生成物，禁止手改
        ↓
组件                        className="bg-card text-foreground" 或 useThemeColor('brand')
```

**两条取色路径，只有这两条：**

- 能用 className 就用 className：`bg-card`、`text-muted-foreground`、`border-border-strong`、`bg-primary/10`
- 需要把颜色当值传给原生 prop（`ActivityIndicator color`、Skia、`@expo/ui` 的 `Image color`、`Stack.Screen` 的 `screenOptions`）时用 hook：

```tsx
const scrimColor = useThemeColor('scrim');
const [accent, ring] = useThemeColor(['primary', 'constant-white']);
```

`useThemeColor` 接契约名（不带 `--color-` 前缀），单个返回 `string`，数组返回等长元组。

### 加一个 token 之前

先回答：**这个角色已经有名字了吗？** 38 个产品 token 里大概率已经有。真要加：

1. 值写在 `product.css`，指向调色板档位（`var(--green-900)`），不写 oklch 字面量 —— 除非它必须不随主题变，见下。
2. 名字加进 `scripts/theme-contract.ts` 的 `CHERRY_PRODUCT_VARIABLE_TOKENS`。
3. 跑 `pnpm design:build` 重新生成 `native.css`，再跑 `pnpm design:check`。
4. 如果它值得在 Storybook 里被看见，加进 `packages/ui/stories/foundations/tokens.ts`。

`check.ts` 会断言：契约名单与生成物逐项按序一致、引用可解析、无循环、`@variant light` 与 `@variant dark` 的变量集合完全相等。漏写深色值会被挡下来。

### 允许写字面色的四种情况

除此之外没有第五种。新增字面色必须在同一个 commit 里说明它属于哪一种。

| 情况 | 例子 | 为什么 token 治不了 |
|---|---|---|
| **压在不受控内容上的 chrome** | 图片查看器、相机取景、缩略图角标 | 底下是照片，既不是浅色也不是深色表面。已有 `--constant-black` / `--constant-white` 兜住，**优先用它们，别再写新的** |
| **美术资产** | `thinkingPalette.ts` 的 33 个着色器色、`logoPalette.ts` | 它们表达的是彼此之间的关系，不是角色。改一个就毁掉整张图 |
| **token 的上游** | `brandAvatarStyles.ts` 按亮度算黑白 | 它的产出**是**颜色决策的输入，反过来读 token 就成环了 |
| **不在渲染树里** | `LoggerService` 的 `%c` console 样式、构建脚本 | 根本不经过 uniwind |

“这个颜色在系统里就该长这样”**不在**列内。字面色的典型下场是同一角色在不同文件里悄悄分叉：模态遮罩曾经一处 40%、另一处 20%，同一个应用里两种压暗程度，直到收敛成 `--scrim` 才被发现。

### 品牌色的两个名字

`--primary` 和 `--brand` 当前解析到同一个值，但含义不同：

- `--brand` = 「这里必须是产品的绿」。像素场旁边那个点用它。
- `--primary` = 「这里是主色，将来若做主题色设置会跟着变」。选中态、主按钮用它。

判据一句话：**用户把主题色调成紫色之后，这里该不该变紫？**

> `--theme-primary` 那层运行时输入已删（`beccaa2e`）—— 移动端从来没有设置主题色的界面。偏好键 `ui.theme_user.color_primary` 保留在 `packages/universal`（持久化数据、与桌面共享）。真要做这个功能，是先做界面再把这层接回来。

### 对比度

正文（`text-sm` / `text-base`，含 semibold）按 WCAG 要 **4.5:1**；图形与边框要 **3:1**。

这不是纸面要求。`--brand` 从 `#00b96b` 换成 `green-900` 就是因为前者在白底上只有 2.58:1，而 `text-brand` 落在正文上。改颜色前先算，别先看。

### 灰阶不是单调的

Geist 的灰阶有意做了非单调，照名字顺序对齐分级角色会在浅色下反转层级：

- 浅色：`gray-400` 比 `gray-300` **更浅**
- 浅色：`gray-alpha-400`(.08) 比 `gray-alpha-300`(.1) **更淡**
- 深色：`gray-alpha-800`(.47) 比 `gray-alpha-700`(.54) **更淡**

所以四级边框跳过了 300/400 档，取 100/200/500/700。**按实测亮度挑档，永远不按编号。**

### 单色优先

默认用中性色。颜色只在它承载信息时出现 —— 状态（success/warning/error/info）、选中、品牌。不要因为「这个数字是好消息」就把它变绿，也不要用色块给版面分区。

同时给一个非颜色线索：色盲用户看不出红绿，图标形状、文案、位置得能独立说明问题。

---

## 排版

阶梯在 `src/frontend/utils/typographyScale.ts` 的 `sizeSequence`，13 档。前九档逐字采用 VBG 的 size/leading 配对：

| 档 | 值 | VBG 角色 |
|---|---|---|
| `text-xs` | 13 / 18 | label、metadata |
| `text-sm` | 14 / 20 | compact |
| `text-base` | 16 / 24 | body |
| `text-lg` | 18 / 28 | lede |
| `text-xl` | 20 / 26 | subsection |
| `text-2xl` | 24 / 32 | section |
| `text-3xl` | 32 / 40 | title |
| `text-4xl` | 40 / 48 | page-title |
| `text-5xl` | 48 / 56 | display |
| `6xl`–`9xl` | 60/72/96/128 | VBG 无对应角色，沿用原值 |

**这个数组同时是无障碍字号档位**：`resolveTypographyScale` 按索引平移实现 FontSizeStep 0/1/2，所以顺序必须单调递增，「+1 档」必须仍是「下一级」。改这里就是改无障碍行为。**改 CSS 无效，必须改这个数组。**

字重只有三档：`font-normal`(400)、`font-medium`(500)、`font-semibold`(600)。`font-bold` 已重映射到 600，与 `font-semibold` 同重 —— VBG 最重的角色就是 semibold。不要写 `fontWeight` 数值。

等宽只给 `font-mono`（Geist Mono），且只给代码、命令、路径、原始 token、时间戳、短标识符。**不要把整句或整张表设成等宽。**字体由 `app.json` 的 expo-font 插件在构建期嵌入 —— 改字体必须 `prebuild` + 重新编译，Metro reload 不生效。

层次先靠排版建立，再考虑间距，最后才是表面。同级元素共享 role、字号、字重、行高：**不要因为某个字符串更长或数值更大就单独改它。**

---

## 形状与间距

圆角只有一个源：`--radius` = 8px（VBG 的 `radius`）。`rounded-sm…4xl` 全部由 `build-native-css.ts` 按 `calc(var(--radius) * n)` 派生。四档亚像素发丝圆角（`rounded-4xs…xs`）是例外，不在 VBG 刻度上，逐个写死。

**不要写 `borderRadius` 数值。** 需要新档位就改乘数，不要在组件里绕过。

间距用 Tailwind 默认刻度，它与 VBG 的 4/8/12/16/20/24/32/40/48/64 完全一致，无需转换。

每个间隙只能有一个所有者：容器设 gap，子元素不要再叠自己的 margin。修一处别扭的间距，改的应该是分组或所有者，而不是加一个一次性的 margin。

---

## 表面与边框

界面默认是一块连续的面。**一个面或一条边框必须挣来它的存在** —— 它得表达选中、可交互、警告、或者间距表达不了的真实分组。

顺序：间距 → 对齐 → 排版 → 密度变化 → 最后才是边框和面。

不要每个区块都套卡片，不要卡片套卡片。四级边框（`border-subtle` < `border` < `border-strong` < `border-selected`）在两个主题里都单调，按语义挑，不按视觉试。

觉得界面乱，先分清是**量**的问题还是**响度**的问题：量的问题删内容、合并、重排；响度的问题减少互相竞争的颜色、尺寸、字重、边框、面和动效。保留一个刻意的锚点 —— 克制不是把一切压平成没有重点。

---

## 动效

默认静止。动效只在三种时候加：解释状态变化、保持连续性、确认一个操作。

不要滚动逐段揭示、不要装饰性脉冲、不要视差、不要 hover 位移。**基础体验在零动效下必须是完整的**，`useReducedMotion` 必须真的接线（不是接了就不管）。

已有的重型动效（思考像素场、logo 绘制、水滴收起）都是刻意的单点投入。`useReducedMotion` 目前接在 `PrismSweep`、`PaintingSkeleton`、`SlotText`、`EffortSlider` 上 —— 新增同量级动效时照这几处的写法接，并先问一句它解释了什么。

---

## 图标与媒体

图标走 `lucide-uniwind/png`。`className` 的 `size-*` 决定尺寸、`text-*` 决定 tintColor，显式 props 优先于 className。

⚠️ **`strokeWidth` 是空操作** —— PNG 里已经烤死了描边。它被接受只是为了 call site 能照抄 lucide，传了不会报错也不会生效。别指望用它调粗细。

图标不是装饰。不要放进彩色方块里，不要为了填版面而加。文案能说清的地方优先用文案。

---

## 明确拒绝

以下在本仓库一律不接受：

- **写死的颜色**，除非属于上面四种情况之一并在 commit 里说明
- **两个分支相同的三元** —— `isActive ? 'text-foreground' : 'text-foreground'`。要么让它真的有差别，要么连同那个 prop 一起删
- **只在一个主题下验证过**就提交视觉改动
- **用边框修补弱层次** —— 层次不清是排版和间距的问题，加框只是把它藏起来
- **装饰性渐变、光晕、纹理、假景深、拟纸**。渐变只在它是一条有标注的连续数据刻度时成立
- **同一角色在不同文件里取不同值**。发现两处不一致时，正确动作是收敛成一个 token，不是挑一个抄过去
- **给「桌面有」当理由**。判断标准是「这东西会不会被序列化」：会的（part JSON、DB schema、DTO）必须对齐，不会的（取值、交互、视觉）分叉是正常的。取值分叉时 commit 里写真实理由，对齐前先查桌面那段是不是死代码（见 [Universal Package](docs/references/universal-package.md)）
- **绕过 `check.ts`**。它挡下来的是真问题，不是噪音

---

## 改动前后要跑什么

动 token：

```bash
pnpm design:build          # 重新生成 native.css
pnpm design:check          # 契约 + 主题迁移 + 图标三项
```

任何视觉改动：

```bash
pnpm typecheck:app
pnpm test:app -- <pattern>  # 只跑受影响的套件；全量留到开 PR 前
pnpm lint
pnpm format:check
```

**外加：亮色和暗色各看一遍真机或模拟器。**结构上验证过不等于看过 —— 对比度、层次、以及颜色在真实内容上的观感，只有看才知道。

`pnpm design:sync` 只同步图标。`packages/design-tokens/src/styles/` 和 `scripts/theme-contract.ts` 是移动端自有的，**取值和名字都不从桌面镜像** —— 因为没有任何 token 名会在两端之间序列化传输，所以不存在需要对齐的契约，只有会分叉的表现层。反过来说：一次同步会把每个已删的名字重新装回来，所以别把它接回去。

---

## 想看现状

Storybook 的 `Foundations/*` 页在设备上渲染全部调色板、语义分组、表面/前景配对、字号阶梯、字重、圆角和边框层次。改 token 后在那里看比翻 CSS 快。

`packages/ui/stories/foundations/tokens.ts` 是那些页面读的名单，`__tests__/tokens.test.ts` 会拿它和构建产物核对 —— 名字写错在运行时不报错，只是渲染成占位，那个测试是唯一能抓到的地方。

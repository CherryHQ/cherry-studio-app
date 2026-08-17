# Assistant Toolbar Simplification 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 删除 assistant toolbar 的单一调用方包装组件，并在不减少场景覆盖的前提下压缩 Provider 测试的重复表达。

**架构：** 保留 `AssistantMessageActionsProvider`、状态/命令 Context、模块级 renderer 和全部生命周期守卫。`ChatWorkspace` 直接通过 `AssistantMessage` 的 `children` 插槽组合 toolbar；测试简化仅使用文件内 helper，不增加共享测试抽象。

**技术栈：** React 19、React Native、TypeScript、Jest、react-test-renderer、pnpm 11.8.0

---

## 文件结构

- 修改：`src/frontend/features/chat/workspace/ChatWorkspace.tsx` — 直接组合 assistant message 与 toolbar。
- 删除：`src/frontend/features/chat/workspace/components/ChatAssistantMessage.tsx` — 移除无独立职责的单一调用方包装。
- 修改：`src/frontend/features/chat/workspace/__tests__/ChatWorkspace.test.tsx` — 删除已失效的 wrapper mock，保留稳定 renderer 覆盖。
- 修改：`src/frontend/features/chat/workspace/context/__tests__/AssistantMessageActionsProvider.test.tsx` — 用本文件 helper 收敛重复 arrange/act 代码。

### 任务 1：内联单一调用方 assistant message 包装

**文件：**
- 修改：`src/frontend/features/chat/workspace/ChatWorkspace.tsx:8-52`
- 删除：`src/frontend/features/chat/workspace/components/ChatAssistantMessage.tsx`
- 修改：`src/frontend/features/chat/workspace/__tests__/ChatWorkspace.test.tsx:45-80`
- 测试：`src/frontend/features/chat/workspace/__tests__/ChatWorkspace.test.tsx`

- [ ] **步骤 1：建立稳定 renderer 的通过基线**

运行：

```bash
pnpm test:app -- --runInBand src/frontend/features/chat/workspace/__tests__/ChatWorkspace.test.tsx
```

预期：`3 passed`，其中 normal-page case 证明 busy state 更新前后 `renderAssistantMessage` 引用不变。

- [ ] **步骤 2：在模块级 renderer 中直接组合 toolbar**

在 `ChatWorkspace.tsx` 中从 message presentation 导入 `AssistantMessage`，从 workspace components 导入 `AssistantMessageToolbar`，并将 renderer 改为：

```tsx
function renderChatAssistantMessage(message: MessagePresentationItem) {
  return (
    <AssistantMessage message={message}>
      <AssistantMessageToolbar message={message} />
    </AssistantMessage>
  );
}
```

删除 `ChatAssistantMessage` import 和 `components/ChatAssistantMessage.tsx`。这不会把 renderer 移入组件体，也不会改变引用稳定性。

- [ ] **步骤 3：删除失效的 wrapper mock**

从 `ChatWorkspace.test.tsx` 删除：

```tsx
jest.mock('../components/ChatAssistantMessage', () => ({
  ChatAssistantMessage: () => null,
}));
```

不新增替代包装组件或共享 render helper。

- [ ] **步骤 4：验证 renderer 行为与引用清理**

运行：

```bash
pnpm test:app -- --runInBand src/frontend/features/chat/workspace/__tests__/ChatWorkspace.test.tsx
rg -n "ChatAssistantMessage" src/frontend/features/chat/workspace
```

预期：测试 `3 passed`；`rg` 无匹配并以状态码 1 结束。

- [ ] **步骤 5：提交生产结构收缩**

```bash
git add src/frontend/features/chat/workspace/ChatWorkspace.tsx \
  src/frontend/features/chat/workspace/__tests__/ChatWorkspace.test.tsx \
  src/frontend/features/chat/workspace/components/ChatAssistantMessage.tsx
git commit -m "refactor(chat): inline assistant message composition"
```

### 任务 2：压缩 Provider 测试夹具

**文件：**
- 修改：`src/frontend/features/chat/workspace/context/__tests__/AssistantMessageActionsProvider.test.tsx:54-259`
- 测试：`src/frontend/features/chat/workspace/context/__tests__/AssistantMessageActionsProvider.test.tsx`

- [ ] **步骤 1：建立八个生命周期场景的通过基线**

运行：

```bash
pnpm test:app -- --runInBand src/frontend/features/chat/workspace/context/__tests__/AssistantMessageActionsProvider.test.tsx
```

预期：`8 passed`。

- [ ] **步骤 2：收窄 Harness 并建立文件内操作 helper**

从 `ProviderHarness` 删除未使用的 `children` 和 `ReactNode`。在现有 `describe` 内维护一个每个测试重建的 `probeRef`，并加入以下 helper：

```tsx
let probeRef = createRef<ContextProbeHandle>();

function renderProvider(isRegenerateDisabled = false) {
  act(() => {
    renderer = create(
      <ProviderHarness
        isRegenerateDisabled={isRegenerateDisabled}
        onRegenerate={onRegenerate}
        probeRef={probeRef}
      />,
    );
  });
}

function updateProvider(isRegenerateDisabled: boolean) {
  act(() => {
    renderer?.update(
      <ProviderHarness
        isRegenerateDisabled={isRegenerateDisabled}
        onRegenerate={onRegenerate}
        probeRef={probeRef}
      />,
    );
  });
}

function startCopy(messageId: string, text: string) {
  act(() => probeRef.current?.commands.copyAssistantMessage({ messageId, text }));
}

async function copyAndFlush(messageId: string, text: string) {
  await act(async () => {
    probeRef.current?.commands.copyAssistantMessage({ messageId, text });
    await Promise.resolve();
  });
}

function unmountProvider() {
  act(() => renderer?.unmount());
  renderer = undefined;
}
```

在 `beforeEach` 中执行 `probeRef = createRef<ContextProbeHandle>()`。`afterEach` 调用 `unmountProvider()`。

- [ ] **步骤 3：用 helper 改写重复 setup，保留全部断言**

每个测试继续保留原测试名和以下八个独立结果：

1. copied feedback 更新/过期时 commands identity 稳定；
2. busy state 更新时 commands identity 稳定；
3. copy failure 记录日志并展示 alert；
4. pending copy 在卸载后不创建 1200ms timer；
5. 连续成功复制只保留最新 feedback timer；
6. 新复制 pending 时旧 feedback 正常过期；
7. regenerate failure 记录日志并展示 alert；
8. pending regenerate 在卸载后不记录日志或展示 alert。

不要合并这些测试，也不要删除 deferred promise、timer 或 identity 断言。

- [ ] **步骤 4：验证覆盖数量和表达收缩**

运行：

```bash
pnpm test:app -- --runInBand src/frontend/features/chat/workspace/context/__tests__/AssistantMessageActionsProvider.test.tsx
wc -l src/frontend/features/chat/workspace/context/__tests__/AssistantMessageActionsProvider.test.tsx
```

预期：`8 passed`；文件少于当前的 259 行。

- [ ] **步骤 5：提交测试表达收缩**

```bash
git add src/frontend/features/chat/workspace/context/__tests__/AssistantMessageActionsProvider.test.tsx
git commit -m "test(chat): simplify assistant action setup"
```

### 任务 3：验证并更新 PR #556

**文件：**
- 验证：本计划列出的全部变更

- [ ] **步骤 1：格式化并 lint 修改文件**

```bash
pnpm exec oxfmt --write \
  src/frontend/features/chat/workspace/ChatWorkspace.tsx \
  src/frontend/features/chat/workspace/__tests__/ChatWorkspace.test.tsx \
  src/frontend/features/chat/workspace/context/__tests__/AssistantMessageActionsProvider.test.tsx
pnpm exec oxlint --deny-warnings \
  src/frontend/features/chat/workspace/ChatWorkspace.tsx \
  src/frontend/features/chat/workspace/__tests__/ChatWorkspace.test.tsx \
  src/frontend/features/chat/workspace/context/__tests__/AssistantMessageActionsProvider.test.tsx
```

预期：两个命令均退出 0。

- [ ] **步骤 2：运行七个定向测试套件**

```bash
pnpm test:app -- --runInBand \
  src/frontend/components/messagePresentation/components/__tests__/MessageList.test.tsx \
  src/frontend/components/messagePresentation/messageRow/components/__tests__/AssistantMessage.test.tsx \
  src/frontend/components/messagePresentation/messageRow/components/__tests__/UserMessageRow.test.tsx \
  src/frontend/features/chat/workspace/__tests__/ChatWorkspace.test.tsx \
  src/frontend/features/chat/workspace/components/__tests__/AssistantMessageToolbar.test.tsx \
  src/frontend/features/chat/workspace/context/__tests__/AssistantMessageActionsProvider.test.tsx \
  src/frontend/features/chat/workspace/utils/__tests__/copyAssistantMessageText.test.ts
```

预期：`7 passed`，测试总数保持 43。

- [ ] **步骤 3：运行完整类型检查和 diff 检查**

```bash
pnpm typecheck
git diff --check origin/v0.2..HEAD
rg -n "ChatAssistantMessage" src/frontend/features/chat/workspace
```

预期：typecheck 和 diff check 退出 0；`rg` 无匹配。

- [ ] **步骤 4：核对简化结果**

```bash
git diff --stat 83a42736948e8ace5d3f2e820aad0d4e03c823d3..HEAD -- \
  src/frontend/features/chat/workspace
git status --short --branch
```

预期：workspace 生产文件数减少 1，Provider 测试行数下降，工作树干净；没有 Provider、Context、toolbar 或测试场景被删除。

- [ ] **步骤 5：普通推送更新现有 PR**

```bash
git push fork HEAD:codex/message-actions/toolbar
```

预期：快进更新 PR #556；禁止使用 `--force` 或 `--force-with-lease`。

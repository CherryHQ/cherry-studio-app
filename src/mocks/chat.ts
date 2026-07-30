import { generateNKeysBetween } from 'fractional-indexing';

import { DEFAULT_ASSISTANT_SETTINGS } from '@/shared/domain/assistant';
import { type CherryMessagePart, type Message } from '@/shared/domain/message';
import type { Topic } from '@/shared/domain/topic';

const baseDateMs = Date.parse('2026-05-15T00:00:00.000Z');
// Must exceed the largest topic's messageCount (1000) * the per-message offset
// (60_000ms) below, otherwise a topic-index-1000 topic's *last* message could
// out-date a later topic-index's first message and break the intended
// oldest-to-newest ordering across topics.
const topicIndexSpanMs = 100_000_000;
export const mockAssistantId = 'mock-assistant-default';

export const mockChatModel = {
  id: 'cherryai::mock-chat-model',
  modelId: 'mock-chat-model',
  name: 'Mock Chat Model',
  orderKey: 'a0',
  providerId: 'cherryai',
} as const;

export const mockChatAssistant = {
  description: 'Assistant for development chat fixtures',
  emoji: '🍒',
  id: mockAssistantId,
  modelId: mockChatModel.id,
  name: 'Mock Assistant',
  orderKey: 'a1',
  prompt: '',
  settings: DEFAULT_ASSISTANT_SETTINGS,
} as const;

type BenchmarkMessageKind = 'complex' | 'latex' | 'showcase' | 'text';

type BenchmarkTopicSeed = {
  id: string;
  kind: BenchmarkMessageKind;
  messageCount: number;
  name: string;
  orderKey: string;
};

export const mockBenchmarkTopicIdPrefix = 'mock-benchmark-topic-';
export const mockBenchmarkMessageIdPrefix = 'mock-benchmark-message-';

const benchmarkTopicSeeds = [
  createBenchmarkTopicSeed('text', 5, 'a0'),
  createBenchmarkTopicSeed('text', 10, 'a1'),
  createBenchmarkTopicSeed('text', 100, 'a2'),
  createBenchmarkTopicSeed('latex', 5, 'a3'),
  createBenchmarkTopicSeed('latex', 10, 'a4'),
  createBenchmarkTopicSeed('latex', 100, 'a5'),
  createBenchmarkTopicSeed('complex', 5, 'a6'),
  createBenchmarkTopicSeed('complex', 10, 'a7'),
  createBenchmarkTopicSeed('complex', 100, 'a8'),
  createBenchmarkTopicSeed('complex', 1000, 'a9'),
  // Listed last so it gets the largest topicIndex and therefore the newest
  // updatedAt — topics are sorted by updatedAt DESC, so this pins the curated
  // Showcase topic to the top of the list for quick styling review.
  createBenchmarkTopicSeed('showcase', 4, 'b00'),
] satisfies readonly BenchmarkTopicSeed[];

function createBenchmarkTopicSeed(
  kind: BenchmarkMessageKind,
  messageCount: number,
  orderKey: string,
): BenchmarkTopicSeed {
  return {
    id: `${mockBenchmarkTopicIdPrefix}${kind}-${messageCount}`,
    kind,
    messageCount,
    name: `${getBenchmarkKindName(kind)} ${messageCount}`,
    orderKey,
  };
}

function getBenchmarkKindName(kind: BenchmarkMessageKind) {
  switch (kind) {
    case 'complex':
      return 'Benchmark Complex';
    case 'latex':
      return 'Benchmark LaTeX';
    case 'showcase':
      return 'Showcase';
    case 'text':
      return 'Benchmark Plain Text';
  }
}

function isoAt(offsetMs: number) {
  return new Date(baseDateMs + offsetMs).toISOString();
}

function createTextPart(content: string): CherryMessagePart {
  return {
    state: 'done',
    text: content,
    type: 'text',
  };
}

function createBenchmarkMessageContent(seed: BenchmarkTopicSeed, messageNumber: number) {
  switch (seed.kind) {
    case 'complex':
      return createComplexMessageContent(seed, messageNumber);
    case 'latex':
      return createLatexMessageContent(seed, messageNumber);
    case 'showcase':
      return createShowcaseMarkdownContent();
    case 'text':
      return createPlainTextMessageContent(seed, messageNumber);
  }
}

function createPlainTextMessageContent(seed: BenchmarkTopicSeed, messageNumber: number) {
  return [
    `${seed.name} message ${messageNumber} of ${seed.messageCount}.`,
    '',
    'This fixture intentionally avoids Markdown syntax, LaTeX, tables, lists, and code blocks.',
    'It is used as the control group for measuring the cost of ordinary wrapped text.',
    'The content is deterministic so repeated topic switches can be compared across app launches.',
  ].join('\n');
}

function createLatexMessageContent(seed: BenchmarkTopicSeed, messageNumber: number) {
  const n = messageNumber;

  return [
    `# ${seed.name} message ${messageNumber}`,
    '',
    `Inline math sample: $loss_${n} = \\frac{1}{m}\\sum_{i=1}^{m}(y_i - \\hat{y}_i)^2$.`,
    '',
    '$$',
    `\\begin{aligned}`,
    `A_${n} &= \\sum_{k=1}^{${n + 3}} \\frac{k^2 + ${n}}{k + 1} \\\\`,
    `B_${n} &= \\int_0^1 x^{${(n % 5) + 2}}(1-x)^${(n % 4) + 1}\\,dx \\\\`,
    `C_${n} &= \\sqrt{A_${n}^2 + B_${n}^2}`,
    `\\end{aligned}`,
    '$$',
    '',
    `Display equation: $$p(x \\mid \\theta_${n}) = \\prod_{i=1}^{m} \\theta_${n}^{x_i}(1-\\theta_${n})^{1-x_i}$$`,
  ].join('\n');
}

function createComplexMessageContent(seed: BenchmarkTopicSeed, messageNumber: number) {
  return [
    `## ${seed.name} message ${messageNumber}`,
    '',
    'This fixture combines long prose, nested lists, tables, fenced code, inline math, and display math.',
    'It is the stress group for the Markdown Renderer and the Message list initial paint path.',
    '',
    '- Rendering concerns',
    '  - paragraphs should wrap consistently',
    '  - list markers should align after recycling',
    '  - inline `code` and $x^2 + y^2 = z^2$ should not shift row height later',
    '',
    '| Area | Expected behavior |',
    '| --- | --- |',
    '| Text | wraps without clipping |',
    '| Table | keeps borders and cell padding stable |',
    '| Code | uses a stable background and monospace metrics |',
    '| Math | renders inline and display equations |',
    '',
    '```ts',
    `const sample = { topic: "${seed.kind}", messageNumber: ${messageNumber} };`,
    'const visible = sample.messageNumber % 2 === 0 ? "even" : "odd";',
    'expect(visible).toMatch(/even|odd/);',
    '```',
    '',
    '$$',
    `renderCost_${messageNumber} = markdownBlocks \\times parserCost + layoutPasses`,
    '$$',
    '',
    `Trace: ${seed.id}:${messageNumber}`,
  ].join('\n');
}

function createMessage({
  content,
  id,
  messageIndex,
  parentId,
  parts,
  role,
  topicId,
  topicIndex,
}: {
  content: string;
  id: string;
  messageIndex: number;
  parentId: string | null;
  parts?: CherryMessagePart[];
  role: Message['role'];
  topicId: string;
  topicIndex: number;
}): Message {
  const timestamp = isoAt(topicIndex * topicIndexSpanMs + messageIndex * 60_000);

  return {
    createdAt: timestamp,
    data: {
      parts: parts ?? [createTextPart(content)],
    },
    id,
    parentId,
    role,
    searchableText: content,
    siblingsGroupId: 0,
    status: 'success',
    topicId,
    updatedAt: timestamp,
  };
}

function createMockMessagesForTopic(seed: BenchmarkTopicSeed, topicIndex: number): Message[] {
  if (seed.kind === 'showcase') {
    return createShowcaseMessages(seed, topicIndex);
  }

  const messages: Message[] = [];
  let parentId: string | null = null;

  for (let messageIndex = 0; messageIndex < seed.messageCount; messageIndex += 1) {
    const messageNumber = messageIndex + 1;
    const role: Message['role'] = messageIndex % 2 === 0 ? 'user' : 'assistant';
    const id = `${mockBenchmarkMessageIdPrefix}${seed.kind}-${seed.messageCount}-${messageNumber}`;
    const content = createBenchmarkMessageContent(seed, messageNumber);

    messages.push(
      createMessage({
        content,
        id,
        messageIndex,
        parentId,
        role,
        topicId: seed.id,
        topicIndex,
      }),
    );

    parentId = id;
  }

  return messages;
}

// --- Showcase topic -------------------------------------------------------
// A curated topic whose messages deliberately exercise every renderable part
// type and the full Markdown grammar, so the chat UI styling can be reviewed
// in one place. Each assistant message groups related parts together.

function createShowcaseMarkdownContent() {
  return [
    '# H1 标题 Heading 1',
    '## H2 标题 Heading 2',
    '### H3 标题 Heading 3',
    '#### H4 标题 Heading 4',
    '##### H5 标题 Heading 5',
    '###### H6 标题 Heading 6',
    '',
    '普通段落，包含 **粗体**、*斜体*、***粗斜体***、~~删除线~~、`行内代码`，以及一个 [行内链接](https://cherry-ai.com)。',
    '段落里也可以放行内数学 $E = mc^2$，渲染时不应改变行高。',
    '',
    '> 引用块第一行 blockquote',
    '> 引用块第二行，可包含 **强调** 与 `code`。',
    '',
    '无序列表：',
    '',
    '- 第一项 first',
    '- 第二项 second',
    '  - 嵌套项 nested A',
    '  - 嵌套项 nested B',
    '- 第三项 third',
    '',
    '有序列表：',
    '',
    '1. 步骤一 step one',
    '2. 步骤二 step two',
    '3. 步骤三 step three',
    '',
    '任务列表：',
    '',
    '- [x] 已完成任务 done',
    '- [ ] 未完成任务 todo',
    '',
    '表格（含对齐）：',
    '',
    '| 左对齐 | 居中 | 右对齐 |',
    '| :--- | :---: | ---: |',
    '| 文本 | 单元格 | 123 |',
    '| 一个较长的单元格用于测试换行 | mid | 4.56 |',
    '',
    '围栏代码块：',
    '',
    '```ts',
    'function greet(name: string): string {',
    '  return `Hello, $' + '{name}!`;',
    '}',
    '',
    'console.log(greet("Cherry"));',
    '```',
    '',
    '块级数学：',
    '',
    '$$',
    '\\int_0^{\\infty} e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}',
    '$$',
    '',
    '分割线：',
    '',
    '---',
    '',
    '内嵌图片：',
    '',
    '![占位图片 placeholder](https://placehold.co/160x90/png)',
  ].join('\n');
}

function createShowcaseDataParts(): CherryMessagePart[] {
  return [
    // Two reasoning states for a quick visual diff of ReasoningPart: still
    // thinking (ticks a local timer + PrismSweep runs) and finished with a
    // real duration.
    {
      state: 'streaming',
      text: '这是「思考中」状态：正在权衡多种实现方案的利弊，评估每种方案对现有代码的影响范围……',
      type: 'reasoning',
    },
    {
      providerMetadata: { cherry: { thinkingMs: 8300 } },
      state: 'done',
      text: '这是「已深度思考」状态：让我先梳理一下要演示的内容：\n\n1. 推理块（reasoning）\n2. 代码块、压缩块、错误块\n3. 翻译块与视频块',
      type: 'reasoning',
    },
    {
      data: {
        content:
          'def fib(n: int) -> int:\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a',
        language: 'python',
      },
      type: 'data-code',
    },
    {
      data: {
        compactedContent:
          '这是被折叠保存的、更长的原始上下文内容（compactedContent），通常不直接展示。',
        content: '**对话已压缩**：上面较早的若干轮已被总结，以节省上下文窗口。',
      },
      type: 'data-compact',
    },
    {
      data: {
        code: 'ECONNREFUSED',
        message: '无法连接到模型服务：连接被拒绝（请检查 API 地址与网络）。',
        name: 'NetworkError',
        stack:
          'NetworkError: connect ECONNREFUSED 127.0.0.1:443\n    at TCPConnectWrap.afterConnect',
      },
      type: 'data-error',
    },
    {
      data: {
        content:
          'This paragraph has been translated into English to demonstrate the translation block styling.',
        sourceLanguage: 'zh',
        targetLanguage: 'en',
      },
      type: 'data-translation',
    },
    {
      data: {
        url: 'https://example.com/sample-video.mp4',
      },
      type: 'data-video',
    },
  ];
}

function createShowcaseToolParts(): CherryMessagePart[] {
  return [
    {
      state: 'done',
      text: '工具组件 Showcase：Web Search、Meta Tool、MCP Tool、Generic Tool。',
      type: 'text',
    },
    {
      input: { query: 'cherry studio 是什么' },
      output: [
        {
          content: 'Cherry Studio is a desktop client for working with multiple LLM providers.',
          id: 1,
          title: 'Cherry Studio 官网',
          url: 'https://cherry-ai.com',
        },
        {
          content: 'Open source repository for Cherry Studio.',
          id: 2,
          title: 'GitHub 仓库',
          url: 'https://github.com/CherryHQ/cherry-studio',
        },
      ],
      toolMetadata: {
        cherry: {
          tool: { type: 'builtin' },
        },
      },
      state: 'output-available',
      title: 'Web Search',
      toolCallId: 'showcase-tool-web-search',
      toolName: 'web_search',
      type: 'dynamic-tool',
    },
    {
      input: { namespace: 'browser', query: 'open url' },
      output: {
        matchedNamespaces: [
          {
            namespace: 'browser',
            tools: [
              { description: 'Open a URL in the in-app browser.', name: 'open_url' },
              { description: 'Take a screenshot of the current page.', name: 'screenshot' },
            ],
          },
        ],
      },
      toolMetadata: {
        cherry: {
          tool: { type: 'builtin' },
          toolName: 'tool_search',
        },
      },
      state: 'output-available',
      title: 'Meta Tool Search',
      toolCallId: 'showcase-tool-meta-search',
      toolName: 'tool_search',
      type: 'dynamic-tool',
    },
    {
      input: { name: 'browser.open_url' },
      output: '/**\n * Open a URL in the in-app browser.\n * @param url Absolute URL to open.\n */',
      toolMetadata: {
        cherry: {
          tool: { type: 'builtin' },
          toolName: 'tool_inspect',
        },
      },
      state: 'output-available',
      title: 'Meta Tool Inspect',
      toolCallId: 'showcase-tool-meta-inspect',
      toolName: 'tool_inspect',
      type: 'dynamic-tool',
    },
    {
      input: {
        name: 'browser.screenshot',
        params: { fullPage: false },
      },
      output: {
        format: 'png',
        ok: true,
        path: '/tmp/cherry-browser-screenshot.png',
      },
      toolMetadata: {
        cherry: {
          tool: { type: 'builtin' },
          toolName: 'tool_invoke',
        },
      },
      state: 'output-available',
      title: 'Meta Tool Invoke',
      toolCallId: 'showcase-tool-meta-invoke',
      toolName: 'tool_invoke',
      type: 'dynamic-tool',
    },
    {
      input: {
        code: 'const total = [1, 2, 3].reduce((sum, value) => sum + value, 0);\nreturn total;',
      },
      output: {
        isError: false,
        logs: ['total=6'],
        result: 6,
      },
      toolMetadata: {
        cherry: {
          tool: { type: 'builtin' },
          toolName: 'tool_exec',
        },
      },
      state: 'output-available',
      title: 'Meta Tool Exec',
      toolCallId: 'showcase-tool-meta-exec',
      toolName: 'tool_exec',
      type: 'dynamic-tool',
    },
    {
      input: {
        path: '/Users/eeee/Documents/notes/project-plan.md',
      },
      output: {
        content: '# Project Plan\n\n- Define scope\n- Review source URLs\n- Ship mobile UI parity',
        mimeType: 'text/markdown',
      },
      toolMetadata: {
        cherry: {
          tool: {
            serverId: 'filesystem',
            serverName: 'Filesystem',
            type: 'mcp',
          },
        },
      },
      state: 'output-available',
      title: 'MCP Filesystem Read',
      toolCallId: 'showcase-tool-mcp-filesystem-read',
      toolName: 'read_file',
      type: 'dynamic-tool',
    },
    {
      errorText: '调用超时：工具在 30s 内没有返回结果。',
      input: { endpoint: '/api/data' },
      state: 'output-error',
      title: 'Generic Tool Error',
      toolCallId: 'showcase-tool-generic-error',
      toolName: 'api_call',
      type: 'dynamic-tool',
    },
    {
      approval: { id: 'showcase-approval-1' },
      input: { path: '/etc/hosts' },
      state: 'approval-requested',
      title: 'Tool Approval',
      toolCallId: 'showcase-tool-approval',
      toolName: 'read_file',
      type: 'dynamic-tool',
    },
    {
      input: { expression: '2 + 2 * 3' },
      output: 8,
      state: 'output-available',
      toolCallId: 'showcase-tool-static-calculator',
      type: 'tool-calculator',
    },
    {
      sourceId: 'showcase-source-1',
      title: '参考文章：Markdown 渲染最佳实践',
      type: 'source-url',
      url: 'https://example.com/markdown-best-practices',
    },
    {
      filename: 'machine-learning-paper.pdf',
      mediaType: 'application/pdf',
      sourceId: 'showcase-source-2',
      title: '引用文档：机器学习综述',
      type: 'source-document',
    },
    {
      filename: 'dataset.csv',
      mediaType: 'text/csv',
      type: 'file',
      url: 'https://example.com/dataset.csv',
    },
    {
      state: 'done',
      text: '以上演示了推理、各类数据块、工具调用（多种状态）、来源引用与文件附件。',
      type: 'text',
    },
  ];
}

function createShowcaseMessages(seed: BenchmarkTopicSeed, topicIndex: number): Message[] {
  const showcaseMessages: { content: string; parts: CherryMessagePart[]; role: Message['role'] }[] =
    [
      {
        content: '你好，请展示一下各种消息内容和 Markdown 格式。这里附带一张图片。',
        parts: [
          {
            state: 'done',
            text: '你好，请展示一下各种消息内容和 Markdown 格式。这里附带一张图片。',
            type: 'text',
          },
          {
            filename: 'screenshot.png',
            mediaType: 'image/png',
            type: 'file',
            url: 'https://placehold.co/200x120/png',
          },
        ],
        role: 'user',
      },
      {
        content: '这是一条覆盖全部 Markdown 语法的助手消息。',
        parts: [{ state: 'done', text: createShowcaseMarkdownContent(), type: 'text' }],
        role: 'assistant',
      },
      {
        content: '接着演示推理、数据块和工具调用。',
        parts: [{ state: 'done', text: '接着演示推理、数据块和工具调用。', type: 'text' }],
        role: 'user',
      },
      {
        content: '推理块、代码/压缩/错误/翻译/视频数据块，以及工具调用与来源引用的综合演示。',
        parts: [...createShowcaseDataParts(), ...createShowcaseToolParts()],
        role: 'assistant',
      },
    ];

  const messages: Message[] = [];
  let parentId: string | null = null;

  showcaseMessages.forEach((entry, messageIndex) => {
    const id = `${mockBenchmarkMessageIdPrefix}${seed.kind}-${messageIndex + 1}`;

    messages.push(
      createMessage({
        content: entry.content,
        id,
        messageIndex,
        parentId,
        parts: entry.parts,
        role: entry.role,
        topicId: seed.id,
        topicIndex,
      }),
    );

    parentId = id;
  });

  return messages;
}

const mockBenchmarkMessagesByTopicId: Record<string, Message[]> = benchmarkTopicSeeds.reduce(
  (messagesByTopicId, seed, topicIndex) => {
    messagesByTopicId[seed.id] = createMockMessagesForTopic(seed, topicIndex);
    return messagesByTopicId;
  },
  {} as Record<string, Message[]>,
);

const mockBenchmarkTopics: Topic[] = benchmarkTopicSeeds.map((seed, topicIndex) => {
  const messages = mockBenchmarkMessagesByTopicId[seed.id] ?? [];
  const lastMessage = messages[messages.length - 1];
  const createdAt = isoAt(topicIndex * topicIndexSpanMs);

  return {
    ...(lastMessage?.id ? { activeNodeId: lastMessage.id } : {}),
    assistantId: mockAssistantId,
    createdAt,
    id: seed.id,
    isNameManuallyEdited: true,
    name: seed.name,
    orderKey: seed.orderKey,
    updatedAt: lastMessage?.updatedAt ?? createdAt,
  };
});

// --- Persona assistants -----------------------------------------------------
// Curated assistants of different types (coding, translation, writing, data
// analysis, travel planning), each with its own model and a short realistic
// conversation. Unlike the benchmark topics above — which share one assistant
// on purpose to isolate rendering cost — these exist so the topic list and
// assistant list show real variety during development instead of every topic
// pointing at the same assistant.

export const mockPersonaAssistantIdPrefix = 'mock-persona-assistant-';
export const mockPersonaModelIdPrefix = 'mock-persona-';
export const mockPersonaTopicIdPrefix = 'mock-persona-topic-';
export const mockPersonaMessageIdPrefix = 'mock-persona-message-';

type PersonaConversationEntry = {
  content: string;
  role: Message['role'];
};

type PersonaSeed = {
  assistantDescription: string;
  assistantEmoji: string;
  assistantName: string;
  key: string;
  messages: PersonaConversationEntry[];
  modelName: string;
  topicName: string;
};

const personaSeedDefinitions: PersonaSeed[] = [
  {
    assistantDescription: '协助排查 bug、评审代码、给出性能优化建议',
    assistantEmoji: '💻',
    assistantName: '编程助手',
    key: 'code',
    messages: [
      { content: 'FlatList 滚动到 200+ 条数据时明显掉帧，你有什么优化思路？', role: 'user' },
      {
        content: [
          '可以从这几个方向排查：',
          '',
          '1. **列表虚拟化**：确认 `windowSize`、`maxToRenderPerBatch` 是否为默认值，数据量大时建议调小。',
          '2. **item 高度**：如果每行高度可预测，加上 `getItemLayout` 避免测量开销。',
          '3. **组件记忆化**：确保 `renderItem` 内部组件用 `memo` 包裹，避免无关 re-render。',
          '',
          '先说说你现在的行高是固定的还是动态的？',
        ].join('\n'),
        role: 'assistant',
      },
      { content: '行高不固定，里面有图片和变长文本。', role: 'user' },
      {
        content: [
          '那 `getItemLayout` 用不了，建议换成 `FlashList` 或 `@legendapp/list`，它们都支持动态高度估算 + 回收复用，比 FlatList 在这种场景下表现好很多。',
          '',
          '如果想快速验证，可以先加个开关对比两种实现：',
          '',
          '```tsx',
          'const List = useFlashList ? FlashList : FlatList;',
          '```',
          '',
          '线上环境建议直接切 FlashList，长期看维护成本更低。',
        ].join('\n'),
        role: 'assistant',
      },
    ],
    modelName: 'GPT-4o mini',
    topicName: 'RN 列表卡顿排查',
  },
  {
    assistantDescription: '中英文互译，兼顾语气和场景',
    assistantEmoji: '🌐',
    assistantName: '翻译助手',
    key: 'translate',
    messages: [
      {
        content: '帮我把这句翻译成地道的英文文案：「轻如羽毛的性能，如影随形的智能。」',
        role: 'user',
      },
      {
        content: [
          'Featherlight performance, intelligence that follows you everywhere.',
          '',
          '如果想要更偏营销感，也可以试试：',
          '',
          '> Effortlessly light. Effortlessly smart.',
        ].join('\n'),
        role: 'assistant',
      },
      {
        content: [
          '第二个版本不错，反过来帮我看看这句英文口语化怎么翻：',
          '',
          '“We shipped it, it broke, we fixed it, we shipped it again.”',
        ].join('\n'),
        role: 'user',
      },
      {
        content: [
          '偏口语、带点自嘲和干脆利落的语气，可以译成：',
          '',
          '「上线，出问题，修好，再上线。」',
          '',
          '或者更强调反复迭代的节奏感：',
          '',
          '「炸了就修，修完接着发。」',
        ].join('\n'),
        role: 'assistant',
      },
    ],
    modelName: 'DeepSeek-V3',
    topicName: '产品文案中英翻译',
  },
  {
    assistantDescription: '邮件、文案与产品文档的写作与润色',
    assistantEmoji: '✍️',
    assistantName: '写作助手',
    key: 'writing',
    messages: [
      {
        content:
          '帮我写一封给用户的新版本发布邮件开头，语气亲切但专业，提到这次主要优化了启动速度。',
        role: 'user',
      },
      {
        content: [
          '## 主题：更快一步的 Cherry Studio 来了 🍒',
          '',
          '嗨，',
          '',
          '这次更新我们把大部分精力放在了「快」这件事上——启动速度提升了近 40%，从点开图标到能敲下第一行提示词，几乎感觉不到等待。',
          '',
          '除此之外，我们还修复了一些你可能已经吐槽很久的小问题……',
        ].join('\n'),
        role: 'assistant',
      },
      {
        content: '开头不错，能不能再精简一点，去掉「几乎感觉不到等待」这种略显夸张的说法？',
        role: 'user',
      },
      {
        content: [
          '嗨，',
          '',
          '这次更新我们把大部分精力放在了「快」这件事上——启动速度提升了近 40%。',
          '',
          '除此之外，我们还修复了一些你可能已经吐槽很久的小问题……',
          '',
          '这版改动不大，但每一处都是从真实反馈里挑出来的。',
        ].join('\n'),
        role: 'assistant',
      },
    ],
    modelName: 'Claude 3.7 Sonnet',
    topicName: '新版本发布邮件',
  },
  {
    assistantDescription: '整理数据、找规律，给出可执行的分析结论',
    assistantEmoji: '📊',
    assistantName: '数据分析助手',
    key: 'analyst',
    messages: [
      {
        content: [
          '这是本季度四个城市的销售额（万元），帮我看看趋势：',
          '',
          '北京：128、135、142',
          '上海：156、149、161',
          '广州：88、95、101',
          '深圳：102、110、119',
          '',
          '分别对应 4 月、5 月、6 月。',
        ].join('\n'),
        role: 'user',
      },
      {
        content: [
          '整理成表格更直观：',
          '',
          '| 城市 | 4月 | 5月 | 6月 | 环比（6月/4月） |',
          '| --- | ---: | ---: | ---: | ---: |',
          '| 北京 | 128 | 135 | 142 | +10.9% |',
          '| 上海 | 156 | 149 | 161 | +3.2% |',
          '| 广州 | 88 | 95 | 101 | +14.8% |',
          '| 深圳 | 102 | 110 | 119 | +16.7% |',
          '',
          '几个观察：',
          '',
          '- **深圳、广州增速最快**，两地环比增长都超过 10%，值得追加投放预算。',
          '- **上海 5 月出现回落**再回升，波动较大，建议排查是否有渠道或促销节奏的问题。',
          '- 整体四城合计从 474 万增至 523 万，环比 **+10.3%**。',
        ].join('\n'),
        role: 'assistant',
      },
      { content: '上海那个波动能再具体分析一下可能原因吗？', role: 'user' },
      {
        content: [
          '从数据本身看不出具体原因，但常见的几种可能：',
          '',
          '1. 5 月是否有大促活动被提前到 4 月透支了需求？',
          '2. 是否存在库存或物流问题导致 5 月发货延迟？',
          '3. 竞对是否在 5 月有明显促销动作？',
          '',
          '建议对照一下 5 月的运营日历和竞品价格变化，这类环比小幅波动通常能在这两类因素里找到答案。',
        ].join('\n'),
        role: 'assistant',
      },
    ],
    modelName: 'Gemini 2.5 Pro',
    topicName: '季度销售数据分析',
  },
  {
    assistantDescription: '按预算和偏好规划行程与交通方式',
    assistantEmoji: '✈️',
    assistantName: '旅行规划助手',
    key: 'travel',
    messages: [
      {
        content: '十一月中旬去东京五天四晚，两个人，喜欢逛街和吃，不太想赶景点，帮我排个行程。',
        role: 'user',
      },
      {
        content: [
          '十一月中旬东京正好赶上红叶季尾声，五天四晚这样安排比较松弛：',
          '',
          '**第一天**：抵达 → 入住新宿 → 晚上逛歌舞伎町和思い出横丁吃串烧',
          '',
          '**第二天**：涩谷（SHIBUYA SKY 看夜景）→ 原宿竹下通 → 表参道逛买手店',
          '',
          '**第三天**：浅草寺 → 上野公园赏红叶 → 秋叶原',
          '',
          '**第四天**：吉祥寺（井之头公园和杂货店）→ 下北泽（古着和小酒馆）',
          '',
          '**第五天**：银座免税购物 → 前往机场',
          '',
          '要不要我把每天的交通方式也标出来？',
        ].join('\n'),
        role: 'assistant',
      },
      {
        content: '麻烦把交通方式标一下，我们打算全程用地铁加步行，尽量不打车。',
        role: 'user',
      },
      {
        content: [
          '全程地铁加步行完全可行，建议买一张西瓜卡（Suica）或 PASMO，主要线路如下：',
          '',
          '| 天数 | 主要交通 |',
          '| --- | --- |',
          "| Day1 | 机场 → 新宿：JR 成田特快 N'EX 或利木津巴士 |",
          '| Day2 | 新宿 → 涩谷 → 原宿 → 表参道：JR 山手线，站间步行即可串联 |',
          '| Day3 | 新宿 → 浅草：都营大江户线转银座线；浅草 → 上野：银座线；上野 → 秋叶原：日比谷线 |',
          '| Day4 | 新宿 → 吉祥寺：JR 中央线；吉祥寺 → 下北泽：京王井之头线 |',
          '| Day5 | 新宿 → 银座：丸之内线；银座 → 机场：京成或 JR 联程 |',
          '',
          '山手线沿线（新宿-涩谷-原宿-上野-秋叶原）基本覆盖了大半行程，非常适合不打车的玩法。',
        ].join('\n'),
        role: 'assistant',
      },
    ],
    modelName: 'GLM-4.6',
    topicName: '东京五日行程规划',
  },
];

// Order keys are generated, never hand-written: fractional indexing encodes the
// integer-part length in the first character (an `a` head means two characters, a
// `c` head means four), so plausible-looking keys like `a10` or `c4` are invalid.
// `insertWithOrderKey` derives the next key from the largest one already stored,
// so a single malformed fixture key makes every later insert into that table
// throw `invalid order key` — which reads as "sending a message is broken".
const personaOrderKeys = {
  assistants: generateNKeysBetween(mockChatAssistant.orderKey, null, personaSeedDefinitions.length),
  models: generateNKeysBetween(mockChatModel.orderKey, null, personaSeedDefinitions.length),
  // After every benchmark topic, matching the updatedAt ordering below.
  topics: generateNKeysBetween(
    benchmarkTopicSeeds[benchmarkTopicSeeds.length - 1].orderKey,
    null,
    personaSeedDefinitions.length,
  ),
};

export const mockPersonaModels = personaSeedDefinitions.map((seed, index) => ({
  id: `cherryai::${mockPersonaModelIdPrefix}${seed.key}`,
  modelId: `${mockPersonaModelIdPrefix}${seed.key}`,
  name: seed.modelName,
  orderKey: personaOrderKeys.models[index],
  providerId: 'cherryai',
}));

export const mockPersonaAssistants = personaSeedDefinitions.map((seed, index) => ({
  description: seed.assistantDescription,
  emoji: seed.assistantEmoji,
  id: `${mockPersonaAssistantIdPrefix}${seed.key}`,
  modelId: mockPersonaModels[index].id,
  name: seed.assistantName,
  orderKey: personaOrderKeys.assistants[index],
  prompt: '',
  settings: DEFAULT_ASSISTANT_SETTINGS,
}));

function createPersonaMessagesForTopic(
  seed: PersonaSeed,
  topicId: string,
  topicIndex: number,
): Message[] {
  const messages: Message[] = [];
  let parentId: string | null = null;

  seed.messages.forEach((entry, messageIndex) => {
    const id = `${mockPersonaMessageIdPrefix}${seed.key}-${messageIndex + 1}`;

    messages.push(
      createMessage({
        content: entry.content,
        id,
        messageIndex,
        parentId,
        role: entry.role,
        topicId,
        topicIndex,
      }),
    );

    parentId = id;
  });

  return messages;
}

const mockPersonaMessagesByTopicId: Record<string, Message[]> = personaSeedDefinitions.reduce(
  (messagesByTopicId, seed, index) => {
    const topicId = `${mockPersonaTopicIdPrefix}${seed.key}`;
    // Sequenced after every benchmark/showcase topic so persona topics carry
    // the newest updatedAt and surface at the top of the topic list.
    const topicIndex = benchmarkTopicSeeds.length + index;
    messagesByTopicId[topicId] = createPersonaMessagesForTopic(seed, topicId, topicIndex);
    return messagesByTopicId;
  },
  {} as Record<string, Message[]>,
);

const mockPersonaTopics: Topic[] = personaSeedDefinitions.map((seed, index) => {
  const topicId = `${mockPersonaTopicIdPrefix}${seed.key}`;
  const topicIndex = benchmarkTopicSeeds.length + index;
  const messages = mockPersonaMessagesByTopicId[topicId] ?? [];
  const lastMessage = messages[messages.length - 1];
  const createdAt = isoAt(topicIndex * topicIndexSpanMs);

  return {
    ...(lastMessage?.id ? { activeNodeId: lastMessage.id } : {}),
    assistantId: mockPersonaAssistants[index].id,
    createdAt,
    id: topicId,
    isNameManuallyEdited: true,
    name: seed.topicName,
    orderKey: personaOrderKeys.topics[index],
    updatedAt: lastMessage?.updatedAt ?? createdAt,
  };
});

export const mockChatAssistants = [mockChatAssistant, ...mockPersonaAssistants];
export const mockChatModels = [mockChatModel, ...mockPersonaModels];

export const mockMessagesByTopicId: Record<string, Message[]> = {
  ...mockBenchmarkMessagesByTopicId,
  ...mockPersonaMessagesByTopicId,
};

export const mockTopics: Topic[] = [...mockBenchmarkTopics, ...mockPersonaTopics];

export const mockTopicMessages = mockTopics.map((topic) => ({
  messages: mockMessagesByTopicId[topic.id] ?? [],
  topic,
}));

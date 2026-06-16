import {
  type BranchMessagesResponse,
  type CherryMessagePart,
  type Message,
} from '@/data/types/message';
import type { Topic } from '@/data/types/topic';

const baseDateMs = Date.parse('2026-05-15T00:00:00.000Z');
const mockAssistantId = 'mock-assistant-default';

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
  createBenchmarkTopicSeed('showcase', 4, 'b0'),
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
  const timestamp = isoAt(topicIndex * 10_000_000 + messageIndex * 60_000);

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
    '  return `Hello, ${name}!`;',
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
    {
      state: 'done',
      text: '让我先梳理一下要演示的内容：\n\n1. 推理块（reasoning）\n2. 代码块、压缩块、错误块\n3. 翻译块与视频块',
      type: 'reasoning',
    },
    {
      data: {
        content: 'def fib(n: int) -> int:\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a',
        language: 'python',
      },
      type: 'data-code',
    },
    {
      data: {
        compactedContent: '这是被折叠保存的、更长的原始上下文内容（compactedContent），通常不直接展示。',
        content: '**对话已压缩**：上面较早的若干轮已被总结，以节省上下文窗口。',
      },
      type: 'data-compact',
    },
    {
      data: {
        code: 'ECONNREFUSED',
        message: '无法连接到模型服务：连接被拒绝（请检查 API 地址与网络）。',
        name: 'NetworkError',
        stack: 'NetworkError: connect ECONNREFUSED 127.0.0.1:443\n    at TCPConnectWrap.afterConnect',
      },
      type: 'data-error',
    },
    {
      data: {
        content: 'This paragraph has been translated into English to demonstrate the translation block styling.',
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
    { type: 'step-start' },
    {
      input: { query: 'cherry studio 是什么' },
      state: 'input-available',
      title: 'Web Search',
      toolCallId: 'showcase-tool-1',
      toolName: 'web_search',
      type: 'dynamic-tool',
    },
    {
      input: { query: 'cherry studio 是什么' },
      output: {
        results: [
          { title: 'Cherry Studio 官网', url: 'https://cherry-ai.com' },
          { title: 'GitHub 仓库', url: 'https://github.com/CherryHQ/cherry-studio' },
        ],
      },
      state: 'output-available',
      title: 'Web Search',
      toolCallId: 'showcase-tool-2',
      toolName: 'web_search',
      type: 'dynamic-tool',
    },
    {
      errorText: '调用超时：工具在 30s 内没有返回结果。',
      input: { endpoint: '/api/data' },
      state: 'output-error',
      title: 'API Call',
      toolCallId: 'showcase-tool-3',
      toolName: 'api_call',
      type: 'dynamic-tool',
    },
    {
      approval: { id: 'showcase-approval-1' },
      input: { path: '/etc/hosts' },
      state: 'approval-requested',
      title: 'Read File',
      toolCallId: 'showcase-tool-4',
      toolName: 'read_file',
      type: 'dynamic-tool',
    },
    {
      input: { expression: '2 + 2 * 3' },
      output: 8,
      state: 'output-available',
      toolCallId: 'showcase-tool-5',
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
  const showcaseMessages: { content: string; parts: CherryMessagePart[]; role: Message['role'] }[] = [
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

export const mockMessagesByTopicId: Record<string, Message[]> = benchmarkTopicSeeds.reduce(
  (messagesByTopicId, seed, topicIndex) => {
    messagesByTopicId[seed.id] = createMockMessagesForTopic(seed, topicIndex);
    return messagesByTopicId;
  },
  {} as Record<string, Message[]>,
);

export const mockTopics: Topic[] = benchmarkTopicSeeds.map((seed, topicIndex) => {
  const messages = mockMessagesByTopicId[seed.id] ?? [];
  const lastMessage = messages[messages.length - 1];
  const createdAt = isoAt(topicIndex * 10_000_000);

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

export const mockTopicMessages = mockTopics.map((topic) => ({
  messages: mockMessagesByTopicId[topic.id] ?? [],
  topic,
}));

export const activeMockTopic = mockTopics[0];
export const demoChatMessages = activeMockTopic
  ? (mockMessagesByTopicId[activeMockTopic.id] ?? [])
  : [];

export function getMockMessagesForTopic(topicId: string) {
  return mockMessagesByTopicId[topicId] ?? [];
}

export type GetMockBranchMessagesParams = {
  cursor?: string;
  limit?: number;
  topicId: string;
};

export function getMockBranchMessages({
  cursor,
  limit = 20,
  topicId,
}: GetMockBranchMessagesParams): BranchMessagesResponse {
  const messages = getMockMessagesForTopic(topicId);
  const topic = mockTopics.find((item) => item.id === topicId);

  if (messages.length === 0 || limit <= 0) {
    return {
      activeNodeId: topic?.activeNodeId ?? null,
      assistantId: topic?.assistantId ?? null,
      items: [],
    };
  }

  const cursorIndex =
    typeof cursor === 'string' ? messages.findIndex((message) => message.id === cursor) : -1;
  const endIndex = cursorIndex >= 0 ? cursorIndex : messages.length;
  const startIndex = Math.max(0, endIndex - limit);
  const page = messages.slice(startIndex, endIndex);

  return {
    activeNodeId: topic?.activeNodeId ?? null,
    assistantId: topic?.assistantId ?? null,
    items: page.map((message) => ({ message })),
    nextCursor: startIndex > 0 ? page[0]?.id : undefined,
  };
}

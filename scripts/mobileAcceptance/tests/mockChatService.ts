import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const MOCK_MODEL = 'cherry-e2e-chat';
export const MOCK_API_KEY = 'cherry-e2e-local-key';

type Message = { role: string; content: unknown };
type ChatRequest = { messages: Message[] };

export type MockChatService = {
  /** The base URL as the device reaches the host's loopback. */
  baseUrl: (platform: string) => string;
  /** Answers every request whose latest user message contains `question`. */
  reply: (question: string, answer: string) => void;
  /** Message texts of the first request asking `question`, the context the app sent with it. */
  transcriptOf: (question: string) => string[] | undefined;
  close: () => Promise<void>;
};

function messageText(message: Message): string {
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content
    .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
    .join('');
}

// An OpenAI-compatible chat service on the host. Requests matching no registered question (the
// onboarding check) get a fixed answer, so only registered replies can satisfy a test. Automatic
// session naming quotes the conversation, so it can receive a registered reply as its title.
export async function startMockChatService(port: number): Promise<MockChatService> {
  const replies = new Map<string, string>();
  const requests: ChatRequest[] = [];

  const lastUserText = (request: ChatRequest) => {
    const lastUser = request.messages.findLast((message) => message.role === 'user');
    return lastUser ? messageText(lastUser) : '';
  };
  const answerFor = (request: ChatRequest): string => {
    const text = lastUserText(request);
    for (const [question, answer] of replies) if (text.includes(question)) return answer;
    return 'OK';
  };

  const server = createServer((req, res) => {
    void handle(req, res).catch(() => res.writeHead(500).end());
  });
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === 'GET' && req.url?.endsWith('/models')) {
      json(res, {
        object: 'list',
        data: [{ id: MOCK_MODEL, object: 'model', owned_by: 'cherry' }],
      });
      return;
    }
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404).end();
      return;
    }
    const body = JSON.parse(await readBody(req)) as ChatRequest & { stream?: boolean };
    requests.push({ messages: body.messages });
    const content = answerFor(body);
    if (!body.stream) {
      json(res, {
        id: 'chatcmpl-e2e',
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: MOCK_MODEL,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const chunk = (delta: object, finishReason: string | null) =>
      res.write(
        `data: ${JSON.stringify({
          id: 'chatcmpl-e2e',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: MOCK_MODEL,
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        })}\n\n`,
      );
    chunk({ role: 'assistant', content }, null);
    chunk({}, 'stop');
    res.end('data: [DONE]\n\n');
  };

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const actualPort = (server.address() as AddressInfo).port;

  return {
    // The Android emulator reaches the host's loopback through 10.0.2.2.
    baseUrl: (platform) =>
      `http://${platform === 'android' ? '10.0.2.2' : '127.0.0.1'}:${actualPort}/v1`,
    reply: (question, answer) => void replies.set(question, answer),
    transcriptOf: (question) =>
      requests
        .find((request) => lastUserText(request).includes(question))
        ?.messages.map(messageText),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function json(res: ServerResponse, body: object) {
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

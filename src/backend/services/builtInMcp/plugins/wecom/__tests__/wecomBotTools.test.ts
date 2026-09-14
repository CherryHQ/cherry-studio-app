import { getWecomBotTools } from '../wecomBotTools';

function service() {
  const method = (name: string) => ({
    path: `/todo/${name}`,
    http_method: 'POST',
    request: { $ref: 'Request' },
  });
  return {
    schemas: {
      Request: {
        type: 'object',
        required: ['items'],
        properties: { items: { type: 'array', items: { $ref: 'Item' } } },
      },
      Item: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    },
    methods: { list: method('list'), create: method('create'), export: method('export') },
  };
}

it('admits reviewed paths with local effects and validates named request schemas', () => {
  const tools = getWecomBotTools('todo', service());
  expect(tools.map((tool) => [tool.definition.name, tool.effect])).toEqual([
    ['wecom_todo_list', 'read'],
    ['wecom_todo_create', 'write'],
  ]);
  expect(tools[0].path).toBe('/cli/todo/list');
  expect(tools[0].parseInput({ items: [{ title: 'Task' }] })).toEqual({
    items: [{ title: 'Task' }],
  });
  expect(() => tools[0].parseInput({ items: [{ title: 123 }] })).toThrow('Invalid Wecom arguments');
  expect(tools[1].definition.annotations?.readOnlyHint).toBe(false);
});

it.each([
  'https://attacker.test/cli',
  'https://qyapi.weixin.qq.com/cgi-bin',
  'https://name@qyapi.weixin.qq.com/cli',
])('rejects endpoints outside the official CLI gateway: %s', (base_url) => {
  expect(() => getWecomBotTools('todo', { ...service(), base_url })).toThrow(
    'Untrusted Wecom tool endpoint',
  );
});

it('rejects redirection to a different method on the same official gateway', () => {
  const value = service();
  value.methods.list.path = '/todo/delete';
  expect(() => getWecomBotTools('todo', value)).toThrow('Untrusted Wecom tool endpoint');
});

it('omits a method when a required nested input needs file handling', () => {
  const value = service();
  Object.assign(value.schemas.Item.properties.title, { 'x-wecom-file-upload': true });
  expect(getWecomBotTools('todo', value)).toEqual([]);
});

it('keeps inline inputs but rejects optional file arguments at every depth', () => {
  const value = service();
  Object.assign(value.schemas.Request.properties, {
    file_path: { type: 'string', 'x-wecom-file-upload': true },
  });
  Object.assign(value.schemas.Item.properties, {
    attachment: { type: 'string', 'x-wecom-file-upload': true },
  });
  const [tool] = getWecomBotTools('todo', value);
  expect(tool.parseInput({ items: [{ title: 'Task' }] })).toEqual({ items: [{ title: 'Task' }] });
  expect(() => tool.parseInput({ items: [], file_path: '/private/document.md' })).toThrow(
    'Invalid Wecom arguments',
  );
  expect(() =>
    tool.parseInput({ items: [{ title: 'Task', attachment: '/private/data' }] }),
  ).toThrow('Invalid Wecom arguments');
});

it('retains recursive JSON structures such as smart-table formulas', () => {
  const value = service();
  Object.assign(value.schemas.Item.properties, { child: { $ref: 'Item' } });
  const [tool] = getWecomBotTools('todo', value);
  const input = { items: [{ title: 'Parent', child: { title: 'Child' } }] };
  expect(tool.parseInput(input)).toEqual(input);
  expect(() => tool.parseInput({ items: [{ title: 'Parent', child: { title: 2 } }] })).toThrow(
    'Invalid Wecom arguments',
  );
});

it('rejects unresolved schema references', () => {
  const value = service();
  Object.assign(value.schemas.Item.properties, { child: { $ref: 'Missing' } });
  expect(() => getWecomBotTools('todo', value)).toThrow('Unsupported Wecom schema reference');
});

it('admits the documented identity method even though CLI help hides it', () => {
  const [tool] = getWecomBotTools('identity', {
    schemas: { Request: { type: 'object', properties: {} } },
    methods: {
      whoami: {
        path: '/identity/whoami',
        hidden: true,
        http_method: 'POST',
        request: { $ref: 'Request' },
      },
    },
  });
  expect(tool.definition.name).toBe('wecom_identity_whoami');
  expect(tool.parseInput({})).toEqual({});
});

it('limits mixed message schemas to Markdown text, including direct tool calls', () => {
  const [tool] = getWecomBotTools('message', {
    schemas: {
      Request: {
        type: 'object',
        properties: {
          chat_id: { type: 'string' },
          msg_type: { type: 'string' },
          markdown: {
            type: 'object',
            properties: { content: { type: 'string' } },
            required: ['content'],
          },
          file: { type: 'object', properties: { media_id: { type: 'string' } } },
        },
      },
    },
    resources: {
      aibot: {
        methods: {
          send: { path: '/message/aibot/send', http_method: 'POST', request: { $ref: 'Request' } },
        },
      },
    },
  });
  const input = { chat_id: 'session', msg_type: 'markdown', markdown: { content: 'Hello' } };
  expect(tool.parseInput(input)).toEqual(input);
  expect(() =>
    tool.parseInput({ chat_id: 'session', msg_type: 'file', file: { media_id: 'media' } }),
  ).toThrow('Invalid Wecom arguments');
  expect(() => tool.parseInput({ ...input, file: { media_id: 'media' } })).toThrow(
    'Invalid Wecom arguments',
  );
  expect(() => tool.parseInput({ chat_id: 'session', msg_type: 'markdown' })).toThrow(
    'Invalid Wecom arguments',
  );
});

it('returns long document and nested mail text in memory instead of filesystem paths', () => {
  const [tool] = getWecomBotTools('mail', {
    schemas: {
      Request: { type: 'object', properties: {} },
      Response: {
        type: 'object',
        properties: { mail_list: { type: 'array', items: { $ref: 'Mail' } } },
      },
      Mail: {
        type: 'object',
        properties: {
          file_path: { type: 'string', 'x-wecom-file-save': { fileName: 'mail_content' } },
        },
      },
    },
    methods: {
      get: {
        path: '/mail/get',
        http_method: 'POST',
        request: { $ref: 'Request' },
        response: { $ref: 'Response' },
      },
    },
  });
  expect(
    tool.readResult({
      mail_list: [
        { file_path: 'Long mail body' },
        { file_path: { file_name: 'mail.md', content: '5L2g5aW9', content_encoding: 'base64' } },
      ],
    }),
  ).toEqual({ mail_list: [{ inline_content: 'Long mail body' }, { inline_content: '你好' }] });
});

it('keeps inline mail while excluding attachments and embedded images', () => {
  const [tool] = getWecomBotTools('mail', {
    schemas: {
      Request: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          file_path: { type: 'string', 'x-wecom-file-upload': true },
          attachments: { type: 'array', items: { type: 'object' } },
          inline_images: { type: 'array', items: { type: 'object' } },
        },
      },
    },
    methods: { send: { path: '/mail/send', http_method: 'POST', request: { $ref: 'Request' } } },
  });
  expect(tool.parseInput({ content: 'Body' })).toEqual({ content: 'Body' });
  for (const field of ['attachments', 'inline_images']) {
    expect(() => tool.parseInput({ content: 'Body', [field]: [{ media_id: 'media' }] })).toThrow(
      'Invalid Wecom arguments',
    );
  }
});

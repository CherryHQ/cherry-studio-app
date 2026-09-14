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
        properties: { items: { type: 'array', items: { $ref: 'Item' } } },
      },
      Item: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    },
    methods: { list: method('list'), create: method('create'), delete: method('delete') },
  };
}

it('admits reviewed methods, expands named schemas, and owns read/write effects locally', () => {
  const tools = getWecomBotTools('todo', service());
  expect(tools.map((tool) => [tool.definition.name, tool.effect])).toEqual([
    ['bot_todo_list', 'read'],
    ['bot_todo_create', 'write'],
  ]);
  expect(tools[0].path).toBe('/cli/todo/list');
  expect(tools[0].definition.inputSchema.properties).toEqual({
    items: {
      type: 'array',
      items: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    },
  });
  expect(tools[1].definition.annotations?.readOnlyHint).toBe(false);
});

it.each([
  'https://attacker.test/cli',
  'https://qyapi.weixin.qq.com/cgi-bin',
  'https://name@qyapi.weixin.qq.com/cli',
])('rejects discovered endpoints outside the official CLI gateway: %s', (base_url) => {
  expect(() => getWecomBotTools('todo', { ...service(), base_url })).toThrow(
    'Untrusted Wecom tool endpoint',
  );
});

it('does not expose methods requiring CLI file uploads', () => {
  const value = service();
  Object.assign(value.schemas.Item.properties.title, { 'x-wecom-file-upload': true });
  expect(getWecomBotTools('todo', value)).toEqual([]);
});

it('rejects recursive references instead of hanging during discovery', () => {
  const value = service();
  Object.assign(value.schemas.Item.properties.title, { $ref: 'Item' });
  expect(() => getWecomBotTools('todo', value)).toThrow('Unsupported Wecom schema reference');
});

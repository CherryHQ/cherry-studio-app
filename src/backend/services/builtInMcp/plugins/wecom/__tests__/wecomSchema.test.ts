import { readWecomService, resolveWecomSchema } from '../wecomSchema';
import { getWecomToolEffect } from '../wecomTools';

const method = { path: '/users/search', http_method: 'GET', request: { $ref: 'Request' } };
const service = {
  base_url: 'https://qyapi.weixin.qq.com/cli',
  schemas: {
    Text: { type: 'string' },
    Request: {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { $ref: 'Text' } },
        internal: { type: 'string', 'x-wecom-hidden': true },
      },
      required: ['keywords', 'internal'],
    },
  },
  resources: {
    users: { methods: { search: { ...method, description: 'Official member search' } } },
  },
};

it('resolves official named schemas, hides internal fields and retains nested tool identity', () => {
  const { tools, warnings } = readWecomService('contact', service);
  expect(warnings).toEqual([]);
  expect(tools[0]).toMatchObject({
    effect: 'read',
    endpoint: { path: '/cli/users/search', method: 'POST' },
    definition: {
      name: 'wecom_contact__users__search',
      description: 'Official member search',
      inputSchema: {
        properties: { keywords: { type: 'array', items: { type: 'string' } } },
        required: ['keywords'],
      },
    },
  });
  expect(tools[0].definition.inputSchema.properties).not.toHaveProperty('internal');
  expect(tools[0].request.properties).toHaveProperty('internal');
});

it('admits newly discovered methods with write approval without guessing read behavior', () => {
  const { tools } = readWecomService('mail', {
    ...service,
    methods: { new_action: method },
    resources: {},
  });
  expect(tools[0].effect).toBe('write');
  expect(getWecomToolEffect(tools[0].definition.name)).toBe('write');
  expect(getWecomToolEffect('wecom_contact__get_userlist')).toBe('write');
});

it.each([
  { base_url: 'https://attacker.test/cli' },
  { base_url: 'https://qyapi.weixin.qq.com/mcp' },
  { path: '/../mcp/bot/doc' },
  { path: '/%2e%2e/mcp/bot/doc' },
  { path: '/users/search?token=secret' },
  { request: { $ref: 'Missing' } },
])('omits an unsafe or incompatible method while keeping valid siblings', (change) => {
  const { tools, warnings } = readWecomService('contact', {
    ...service,
    methods: { bad: { ...method, ...change } },
  });
  expect(tools.map(({ definition }) => definition.name)).toEqual(['wecom_contact__users__search']);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).not.toMatch(/attacker|secret/);
});

it('keeps hidden services/resources/methods out of discovery', () => {
  expect(readWecomService('contact', { ...service, hidden: true }).tools).toEqual([]);
  expect(
    readWecomService('contact', {
      ...service,
      resources: { users: { hidden: true, methods: { search: method } } },
    }).tools,
  ).toEqual([]);
  expect(
    readWecomService('contact', {
      ...service,
      resources: {},
      methods: { search: { ...method, hidden: true } },
    }).tools,
  ).toEqual([]);
});

it('does not let a reviewed read tool acquire an upload or confirmation side effect', () => {
  const changed = {
    ...service,
    schemas: {
      Request: {
        type: 'object',
        properties: { file: { type: 'string', 'x-wecom-file-upload': true } },
      },
    },
  };
  expect(readWecomService('contact', changed).tools).toEqual([]);
});

it('bounds recursive schemas and preserves union constraints while resolving references', () => {
  expect(() => resolveWecomSchema({ $ref: 'A' }, { A: { $ref: 'A' } })).toThrow('recursive');
  expect(
    resolveWecomSchema(
      { oneOf: [{ $ref: 'Text' }, { type: 'null' }] },
      { Text: { type: 'string', maxLength: 10 } },
    ),
  ).toEqual({ oneOf: [{ type: 'string', maxLength: 10 }, { type: 'null' }] });
});

it('does not expose branch-dependent file inputs that cannot be uploaded reliably', () => {
  expect(() =>
    resolveWecomSchema(
      {
        anyOf: [{ type: 'string', 'x-wecom-file-upload': true }, { type: 'null' }],
      },
      {},
    ),
  ).toThrow('file directive');
});

import * as z from 'zod';

import { readWecomService, resolveWecomSchema } from '../wecomSchema';
import { getWecomToolEffect } from '../wecomTools';

const method = { path: '/users/search', http_method: 'GET', request: { $ref: 'Request' } };
const service = {
  base_url: 'https://qyapi.weixin.qq.com/cli',
  schemas: {
    Text: { type: 'string', description: 'Search keyword' },
    Internal: { type: 'string', 'x-wecom-hidden': true },
    Request: {
      type: 'object',
      properties: {
        keywords: { type: 'array', items: { $ref: 'Text' } },
        internal: { $ref: 'Internal' },
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
    endpoint: { path: '/cli/users/search' },
    definition: {
      name: 'wecom_contact__users__search',
      description: 'Official member search',
      inputSchema: {
        properties: { keywords: { type: 'array', items: { description: 'Search keyword' } } },
        required: ['keywords'],
      },
    },
  });
  expect(tools[0].definition.inputSchema.properties).not.toHaveProperty('internal');
  expect(tools[0].request.properties).toHaveProperty('internal');
  const validator = z.fromJSONSchema(
    tools[0].definition.inputSchema as Parameters<typeof z.fromJSONSchema>[0],
  );
  expect(validator.safeParse({ keywords: ['Alice'] }).success).toBe(true);
  expect(validator.safeParse({ keywords: [123] }).success).toBe(false);
  expect(validator.safeParse({}).success).toBe(false);
});

it('admits newly discovered methods with write approval without guessing read behavior', () => {
  const { tools } = readWecomService('mail', {
    ...service,
    methods: { new_action: method },
    resources: {},
  });
  expect(tools[0].effect).toBe('write');
  expect(getWecomToolEffect(tools[0].definition.name)).toBe('write');
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

it('rejects alias-only cycles and preserves union constraints while resolving references', () => {
  expect(() => resolveWecomSchema({ $ref: 'A' }, { A: { $ref: 'A' } })).toThrow('recursive');
  const validator = z.fromJSONSchema(
    resolveWecomSchema(
      { oneOf: [{ $ref: 'Text' }, { type: 'null' }] },
      { Text: { type: 'string', maxLength: 10 } },
    ),
  );
  expect(validator.safeParse(null).success).toBe(true);
  expect(validator.safeParse('short').success).toBe(true);
  expect(validator.safeParse('x'.repeat(11)).success).toBe(false);
});

// Reduced from the official document/smartsheet schemas: formula formatters refer
// back to formula properties, while document content nodes contain child nodes.
const recursiveSchemas = {
  Request: {
    type: 'object',
    properties: {
      doc_name: { type: 'string' },
      fields: { type: 'array', items: { $ref: 'OaField' } },
    },
    required: ['doc_name'],
  },
  OaField: {
    type: 'object',
    properties: { property_formula: { type: 'object', $ref: 'OaFormulaFieldProperty' } },
  },
  OaFormulaFieldProperty: {
    type: 'object',
    properties: {
      formatter: { type: 'object', $ref: 'OaFormatter', description: 'Display format' },
    },
  },
  OaFormatter: {
    type: 'object',
    properties: {
      field_type: { type: 'string' },
      property_formula: { type: 'object', $ref: 'OaFormulaFieldProperty' },
      internal: { type: 'string', 'x-wecom-hidden': true },
    },
    required: ['field_type', 'internal'],
  },
  Response: {
    type: 'object',
    properties: { document: { $ref: 'OaNode' } },
  },
  OaNode: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      children: { type: 'array', items: { type: 'object', $ref: 'OaNode' } },
    },
  },
};

it.each(['doc', 'sheet', 'smartsheet'])(
  'keeps %s creation discoverable and validates mutually recursive fields at every level',
  (name) => {
    const { tools, warnings } = readWecomService(name, {
      schemas: recursiveSchemas,
      methods: { create: { ...method, path: '/create' } },
    });
    expect(warnings).toEqual([]);
    expect(tools).toHaveLength(1);
    const schema = JSON.parse(JSON.stringify(tools[0].definition.inputSchema));
    expect(JSON.stringify(schema)).not.toContain('x-wecom-hidden');
    const validator = z.fromJSONSchema(schema);
    const args = (nested: unknown) => ({
      doc_name: 'Report',
      fields: [
        { property_formula: { formatter: { field_type: 'formula', property_formula: nested } } },
      ],
    });
    expect(validator.safeParse(args({ formatter: { field_type: 'number' } })).success).toBe(true);
    expect(validator.safeParse(args({ formatter: { field_type: 123 } })).success).toBe(false);
    expect(validator.safeParse(args({ formatter: {} })).success).toBe(false);
  },
);

it('keeps document content reads when only the response contains a recursive tree', () => {
  const { tools, warnings } = readWecomService('doc', {
    schemas: recursiveSchemas,
    resources: {
      contents: {
        methods: {
          get: { path: '/get_content', http_method: 'POST', response: { $ref: 'Response' } },
        },
      },
    },
  });
  expect(warnings).toEqual([]);
  expect(tools[0]).toMatchObject({
    effect: 'read',
    definition: { name: 'wecom_doc__contents__get' },
  });
  const validator = z.fromJSONSchema(tools[0].response!);
  const tree = (text: unknown) => {
    let node: unknown = { text };
    for (let depth = 0; depth < 40; depth++) node = { children: [node] };
    return { document: node };
  };
  expect(validator.safeParse(tree('Nested')).success).toBe(true);
  expect(validator.safeParse(tree(123)).success).toBe(false);
});

it('preserves overrides on separate references to the same definition', () => {
  const schema = resolveWecomSchema(
    {
      type: 'object',
      properties: {
        short: { $ref: 'Text/with~special characters', maxLength: 3 },
        long: { $ref: 'Text/with~special characters', maxLength: 10 },
      },
    },
    { 'Text/with~special characters': { type: 'string' } },
  );
  const validator = z.fromJSONSchema(schema);
  expect(validator.safeParse({ short: 'yes', long: 'longer' }).success).toBe(true);
  expect(validator.safeParse({ short: 'longer' }).success).toBe(false);
});

it('finds write directives through recursive references in reviewed read tools', () => {
  const { tools, warnings } = readWecomService('contact', {
    ...service,
    schemas: {
      Request: {
        type: 'object',
        properties: {
          children: { type: 'array', items: { $ref: 'Request' } },
          file: { $ref: 'File' },
        },
      },
      File: { type: 'string', 'x-wecom-file-upload': true },
    },
  });
  expect(tools).toEqual([]);
  expect(warnings).toHaveLength(1);
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
  expect(() =>
    resolveWecomSchema(
      { anyOf: [{ $ref: 'Node' }, { type: 'null' }] },
      {
        Node: {
          type: 'object',
          properties: {
            child: { $ref: 'Node' },
            file: { type: 'string', 'x-wecom-file-save': { fileName: 'content.txt' } },
          },
        },
      },
    ),
  ).toThrow('file directive');
});

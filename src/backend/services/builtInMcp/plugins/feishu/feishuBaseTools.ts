import * as z from 'zod';

import {
  defineFeishuApiTool,
  FeishuIdSchema,
  FeishuOpenIdSchema,
  FeishuPageShape,
} from './feishuApiTool';

const baseShape = {
  app_token: FeishuIdSchema.describe(
    'Base app token from a /base/ URL or wiki_get_node result. A /wiki/ token must be resolved first.',
  ),
};
const tableShape = {
  ...baseShape,
  table_id: FeishuIdSchema.describe('Table ID from the URL or base_list_tables.'),
};
const fieldName = z.string().min(1).max(1000);
const fieldValue = z.union([
  z.string().max(20_000),
  z.number(),
  z.boolean(),
  z.null(),
  z.strictObject({ text: z.string().max(1000), link: z.url().max(4096) }),
  z
    .array(
      z.union([
        z.string().max(1000),
        z.strictObject({ id: FeishuOpenIdSchema }),
        z.strictObject({ file_token: FeishuIdSchema }),
      ]),
    )
    .max(200),
]);
const fields = z
  .record(fieldName, fieldValue)
  .refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= 100)
  .describe(
    'Field names mapped to values. Read base_list_fields first. Dates use millisecond numbers; people use [{id: open_id}]; multi-select and relation fields use arrays. Null clears a value. Unknown select options may create new options.',
  );
const tablePath = (input: { app_token: string; table_id: string }) =>
  `/open-apis/bitable/v1/apps/${encodeURIComponent(input.app_token)}/tables/${encodeURIComponent(input.table_id)}` as const;

export const feishuBaseTools = [
  defineFeishuApiTool({
    name: 'wiki_get_node',
    access: 'read',
    scopes: ['wiki:node:read'],
    description:
      'Resolve a Feishu /wiki/ node token to its actual resource token and type. For a Base requirement table, use the returned obj_token as app_token in base tools; fetch-doc cannot read Base records.',
    input: z.strictObject({ token: FeishuIdSchema.describe('Node token from the /wiki/ URL.') }),
    request: ({ token }) => ({
      method: 'GET',
      path: '/open-apis/wiki/v2/spaces/get_node',
      query: { token },
    }),
  }),
  defineFeishuApiTool({
    name: 'base_list_tables',
    access: 'read',
    scopes: ['base:table:read'],
    description:
      'List one page of tables in a Feishu Base. Continue with page_token when has_more is true.',
    input: z.strictObject({ ...baseShape, ...FeishuPageShape }),
    request: ({ app_token, page_size = 20, page_token }) => ({
      method: 'GET',
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(app_token)}/tables`,
      query: { page_size, page_token },
    }),
  }),
  defineFeishuApiTool({
    name: 'base_list_fields',
    access: 'read',
    scopes: ['base:field:read'],
    description:
      'Read one page of Base field names, types and options before filtering or writing records. Continue while has_more is true.',
    input: z.strictObject({ ...tableShape, ...FeishuPageShape }),
    request: (input) => ({
      method: 'GET',
      path: `${tablePath(input)}/fields`,
      query: { page_size: input.page_size ?? 20, page_token: input.page_token },
    }),
  }),
  defineFeishuApiTool({
    name: 'base_search_records',
    access: 'read',
    scopes: ['base:record:retrieve'],
    description:
      'Search one page of Feishu Base records with selected fields, conditions and sorting. A filter or sort overrides view_id: the search then covers the whole table. Results are incomplete while has_more is true; pass page_token to continue.',
    input: z.strictObject({
      ...tableShape,
      ...FeishuPageShape,
      view_id: FeishuIdSchema.optional(),
      field_names: z.array(fieldName).min(1).max(100).optional(),
      sort: z
        .array(z.strictObject({ field_name: fieldName, desc: z.boolean().optional() }))
        .min(1)
        .max(10)
        .optional(),
      filter: z
        .strictObject({
          conjunction: z.enum(['and', 'or']),
          conditions: z
            .array(
              z.strictObject({
                field_name: fieldName,
                operator: z.enum([
                  'is',
                  'isNot',
                  'contains',
                  'doesNotContain',
                  'isEmpty',
                  'isNotEmpty',
                  'isGreater',
                  'isGreaterEqual',
                  'isLess',
                  'isLessEqual',
                ]),
                value: z.array(z.string().max(1000)).max(10).optional(),
              }),
            )
            .min(1)
            .max(50),
        })
        .optional(),
    }),
    request: ({ app_token, table_id, page_size = 20, page_token, ...body }) => ({
      method: 'POST',
      path: `${tablePath({ app_token, table_id })}/records/search`,
      query: { page_size, page_token, user_id_type: 'open_id' },
      body,
    }),
  }),
  defineFeishuApiTool({
    name: 'base_create_record',
    access: 'write',
    scopes: ['base:record:create'],
    description:
      'Create one record in an existing Feishu Base table. Read its field schema first. This does not create a table or upload files.',
    input: z.strictObject({
      ...tableShape,
      fields,
      client_token: z
        .uuidv4()
        .optional()
        .describe('Optional idempotency UUID. Reuse only for the same intended creation.'),
    }),
    request: (input) => ({
      method: 'POST',
      path: `${tablePath(input)}/records`,
      query: { user_id_type: 'open_id', client_token: input.client_token },
      body: { fields: input.fields },
    }),
  }),
  defineFeishuApiTool({
    name: 'base_update_record',
    access: 'write',
    scopes: ['base:record:update'],
    description:
      'Update only the supplied fields of one Feishu Base record. Get the record ID from base_search_records and inspect the field schema before writing. Omitted fields are preserved.',
    input: z.strictObject({ ...tableShape, record_id: FeishuIdSchema, fields }),
    request: (input) => ({
      method: 'PUT',
      path: `${tablePath(input)}/records/${encodeURIComponent(input.record_id)}`,
      query: { user_id_type: 'open_id' },
      body: { fields: input.fields },
    }),
  }),
];

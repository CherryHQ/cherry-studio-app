import * as z from 'zod';

import { defineFeishuApiTool, FeishuIdSchema, FeishuPageShape } from './feishuApiTool';

export const feishuWikiTools = [
  defineFeishuApiTool({
    name: 'wiki_list_spaces',
    access: 'read',
    scopes: ['wiki:space:retrieve'],
    description:
      '飞书知识库、知识空间。List one page of accessible knowledge spaces, excluding My Library. Continue with page_token while has_more is true even if a page is empty after permission filtering. Use the official list-docs tool to browse documents within a space.',
    input: z.strictObject({
      ...FeishuPageShape,
      page_size: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Page size, 1–50; default 20.'),
    }),
    request: ({ page_size = 20, page_token }) => ({
      method: 'GET',
      path: '/open-apis/wiki/v2/spaces',
      query: { page_size, page_token },
    }),
  }),
  defineFeishuApiTool({
    name: 'wiki_get_space',
    access: 'read',
    scopes: ['wiki:space:read'],
    description:
      '飞书知识库、知识空间。Read metadata for one knowledge space using its actual space ID from wiki_list_spaces or wiki_get_node.',
    input: z.strictObject({ space_id: FeishuIdSchema }),
    request: ({ space_id }) => ({
      method: 'GET',
      path: `/open-apis/wiki/v2/spaces/${encodeURIComponent(space_id)}`,
    }),
  }),
];

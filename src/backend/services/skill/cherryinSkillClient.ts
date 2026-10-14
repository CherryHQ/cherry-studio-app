import * as z from 'zod';

import { createHttpClient } from '@/backend/services/http';
import type { CherryinSkillDetail, CherryinSkillQuery } from '@/shared/contracts/skillMarketplace';
import { SkillsError } from '@/shared/contracts/skills';
import { CHERRYIN_SKILLS_URL } from '@/shared/utils/cherryinSkills';

const localizedText = z.object({ en: z.string(), zh: z.string().nullable() });
const skillSchema = z.object({
  id: z.string().min(1).max(200),
  name: localizedText,
  description: localizedText,
  author: z.string(),
  version: z.string(),
  tags: z.array(z.string()),
  mobileSupport: z.enum(['supported', 'unsupported']),
  downloads: z.number().int().nonnegative(),
  hasPackage: z.boolean(),
  packageSize: z.number().int().nonnegative().nullable(),
  sourceUrl: z.string().nullable(),
});
const pageSchema = z.object({
  items: z.array(skillSchema),
  pagination: z.object({
    offset: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(100),
    hasMore: z.boolean(),
  }),
});

export type CherryinSkillClient = ReturnType<typeof createCherryinSkillClient>;

/** Cherry Mobile discovery uses upstream's mobile-support classification. */
export function createCherryinSkillClient() {
  const client = createHttpClient({ baseUrl: CHERRYIN_SKILLS_URL, timeoutMs: 15_000 });

  async function list(input: CherryinSkillQuery, signal?: AbortSignal) {
    const offset = input.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || (input.query?.length ?? 0) > 200)
      throw new SkillsError('source-invalid', 'Invalid marketplace query.');
    try {
      const { data } = await client.request<unknown>({
        method: 'GET',
        path: '/api/skills',
        query: {
          q: input.query?.trim() || undefined,
          mobileSupport: 'supported',
          sort: input.sort ?? 'popular',
          offset,
          limit: 20,
        },
        credentials: 'omit',
        signal,
        maxResponseBytes: 1024 * 1024,
      });
      const page = pageSchema.parse(data);
      if (page.pagination.offset !== offset || (page.pagination.hasMore && !page.items.length))
        throw new Error('Invalid CherryIN pagination.');
      return {
        items: page.items,
        nextOffset: page.pagination.hasMore ? offset + page.pagination.limit : null,
      };
    } catch (error) {
      signal?.throwIfAborted();
      throw new SkillsError('search-unavailable', 'CherryIN could not load its catalog.', {
        cause: error,
      });
    }
  }

  async function detail(id: string, signal?: AbortSignal): Promise<CherryinSkillDetail> {
    try {
      const { data } = await client.request<unknown>({
        method: 'GET',
        path: `/api/skills/${encodeURIComponent(id)}`,
        credentials: 'omit',
        signal,
        maxResponseBytes: 2 * 1024 * 1024,
      });
      const skill = skillSchema.extend({ longDescription: localizedText }).parse(data);
      if (skill.id !== id) throw new Error('Unexpected CherryIN skill identity.');
      return skill;
    } catch (error) {
      signal?.throwIfAborted();
      throw new SkillsError('source-unreachable', 'CherryIN could not load this Skill.', {
        cause: error,
      });
    }
  }

  return { list, detail, client };
}

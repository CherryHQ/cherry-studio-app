import * as z from 'zod';

import { UniqueModelIdSchema } from './model';

export const EntityTypeSchema = z.enum([
  'assistant',
  'topic',
  'model',
  'agent',
  'knowledge',
  'session',
]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EntityIdSchema = z.union([z.uuidv4(), z.uuidv7(), UniqueModelIdSchema]);
